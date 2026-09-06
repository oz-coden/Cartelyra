import * as THREE from 'three';
import { Room } from '../types/campus';
import { BuildingRenderer } from './BuildingRenderer';

export type PickMode = 'normal' | 'pick_start' | 'pick_dest';

export class RaycastPicker {
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private isPointerDown = false;
  private pointerDownPos = { x: 0, y: 0 };
  public currentMode: PickMode = 'normal';

  public onRoomSelect: ((room: Room, mode: PickMode, clientX: number, clientY: number) => void) | null = null;
  public onBackgroundClick: (() => void) | null = null;

  constructor(
    private camera: THREE.Camera,
    private domElement: HTMLElement,
    private buildingRenderer: BuildingRenderer
  ) {
    this.setupEvents();
  }

  private setupEvents() {
    this.domElement.addEventListener('pointerdown', (e) => {
      this.isPointerDown = true;
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    });

    this.domElement.addEventListener('pointerup', (e) => {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;

      // Ignore drag/pan movements (distance > 6px)
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      if (dist > 6) return;

      this.handlePointerClick(e);
    });

    this.domElement.addEventListener('pointermove', (e) => {
      // Calculate normalized mouse coords (-1 to +1)
      const rect = this.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.handleHover();
    });
  }

  private handleHover() {
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const roomMeshes: THREE.Mesh[] = [];
    for (const record of this.buildingRenderer.roomMeshRecords.values()) {
      roomMeshes.push(record.mesh);
    }

    const intersects = this.raycaster.intersectObjects(roomMeshes, false);
    if (intersects.length > 0) {
      this.domElement.style.cursor = 'pointer';
    } else {
      this.domElement.style.cursor = 'default';
    }
  }

  private handlePointerClick(e: MouseEvent) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const roomMeshes: THREE.Mesh[] = [];
    for (const record of this.buildingRenderer.roomMeshRecords.values()) {
      roomMeshes.push(record.mesh);
    }

    const intersects = this.raycaster.intersectObjects(roomMeshes, false);
    if (intersects.length > 0) {
      const topHit = intersects[0].object;
      const room = topHit.userData.room as Room;
      if (room && this.onRoomSelect) {
        this.onRoomSelect(room, this.currentMode, e.clientX, e.clientY);
      }
    } else {
      if (this.onBackgroundClick) {
        this.onBackgroundClick();
      }
    }
  }
}
