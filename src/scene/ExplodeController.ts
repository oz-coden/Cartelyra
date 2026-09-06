import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { BuildingRenderer } from './BuildingRenderer';

export class ExplodeController {
  private currentGapRatio: number = 0; // 0.0 - 1.0
  private activeFloorLevel: number | 'all' = 'all';
  private tweens: TWEEN.Tween<THREE.Vector3>[] = [];
  public onUpdateCallback: (() => void) | null = null;

  constructor(private buildingRenderer: BuildingRenderer) {}

  public setExplodeRatio(ratio: number) {
    this.currentGapRatio = Math.max(0, Math.min(1, ratio));
    this.applyExplode(400);
  }

  public setFocusedFloor(floorLevel: number | 'all') {
    this.activeFloorLevel = floorLevel;
    this.applyExplode(650);
  }

  public getActiveFloor(): number | 'all' {
    return this.activeFloorLevel;
  }

  private applyExplode(duration: number = 600) {
    // Cancel running tweens
    for (const tw of this.tweens) {
      tw.stop();
    }
    this.tweens = [];

    const isAllMode = this.activeFloorLevel === 'all';
    const focusLevel = typeof this.activeFloorLevel === 'number' ? this.activeFloorLevel : 1;

    for (const floorGroup of this.buildingRenderer.floorGroups.values()) {
      const baseElev = (floorGroup.userData.baseElevation as number) || 0;
      const level = (floorGroup.userData.level as number) || 1;

      let targetY = baseElev;

      if (isAllMode) {
        // Uniform expansion based on slider ratio
        const extraOffsetPerFloor = 9.0 * this.currentGapRatio;
        targetY = baseElev + (level - 1) * extraOffsetPerFloor;
      } else {
        // Specific floor focused mode:
        // Floors below focus stay at base
        // Focus floor itself gets a slight lift (+1.5m)
        // Floors above focus get huge lift (+15m) to clear the view completely!
        if (level < focusLevel) {
          targetY = baseElev;
        } else if (level === focusLevel) {
          targetY = baseElev + 2.0;
        } else {
          // level > focusLevel
          const extraLift = 16.0 + (level - focusLevel - 1) * 6.0;
          targetY = baseElev + extraLift;
        }
      }

      // Tween current floorGroup position.y
      const startPos = { y: floorGroup.position.y };
      const endPos = { y: targetY };

      const tw = new TWEEN.Tween(startPos)
        .to(endPos, duration)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
          floorGroup.position.y = startPos.y;
          if (this.onUpdateCallback) {
            this.onUpdateCallback();
          }
        });

      tw.start();
      // @ts-expect-error tween tracking
      this.tweens.push(tw);
    }

    // Also explode Sky-Bridge along with 2F (bridge connects on 2F)
    const bridgeGroup = this.buildingRenderer.skyBridgeGroup;
    if (bridgeGroup) {
      const bridgeBaseElev = (bridgeGroup.userData.baseElevation as number) || 4.5;
      const bridgeLevel = 2;
      let bridgeTargetY = bridgeBaseElev;

      if (isAllMode) {
        const extraOffsetPerFloor = 9.0 * this.currentGapRatio;
        bridgeTargetY = bridgeBaseElev + (bridgeLevel - 1) * extraOffsetPerFloor;
      } else {
        if (bridgeLevel < focusLevel) {
          bridgeTargetY = bridgeBaseElev;
        } else if (bridgeLevel === focusLevel) {
          bridgeTargetY = bridgeBaseElev + 2.0;
        } else {
          const extraLift = 16.0 + (bridgeLevel - focusLevel - 1) * 6.0;
          bridgeTargetY = bridgeBaseElev + extraLift;
        }
      }

      const startPos = { y: bridgeGroup.position.y };
      const endPos = { y: bridgeTargetY };

      const tw = new TWEEN.Tween(startPos)
        .to(endPos, duration)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
          bridgeGroup.position.y = startPos.y;
          if (this.onUpdateCallback) {
            this.onUpdateCallback();
          }
        });

      tw.start();
      // @ts-expect-error tween tracking
      this.tweens.push(tw);
    }
  }
}
