import './style.css';
import * as THREE from 'three';
import campusDataJson from './data/campus.json';
import { CampusData, Room, RouteFilterType, RouteStep } from './types/campus';

import { SceneManager } from './scene/SceneManager';
import { BuildingRenderer } from './scene/BuildingRenderer';
import { ExplodeController } from './scene/ExplodeController';
import { RouteRenderer } from './scene/RouteRenderer';
import { RaycastPicker } from './scene/RaycastPicker';
import { AStarPathfinder } from './pathfinding/AStar';

import { ThemeManager } from './ui/ThemeManager';
import { SearchPanel } from './ui/SearchPanel';
import { FloorControl } from './ui/FloorControl';
import { StepGuide } from './ui/StepGuide';

class UniviewApp {
  private campusData: CampusData = campusDataJson as CampusData;

  // Scene & Renderers
  private sceneManager: SceneManager;
  private buildingRenderer: BuildingRenderer;
  private explodeController: ExplodeController;
  private routeRenderer: RouteRenderer;
  private raycastPicker: RaycastPicker;
  private pathfinder: AStarPathfinder;

  // UI Components
  private themeManager: ThemeManager;
  private searchPanel: SearchPanel;
  private floorControl: FloorControl;
  private stepGuide: StepGuide;

  // DOM Elements
  private tooltip = document.getElementById('room-tooltip') as HTMLElement;
  private tooltipTitle = document.getElementById('tooltip-title') as HTMLElement;
  private tooltipDesc = document.getElementById('tooltip-desc') as HTMLElement;
  private btnTooltipStart = document.getElementById('btn-tooltip-set-start') as HTMLElement;
  private btnTooltipDest = document.getElementById('btn-tooltip-set-dest') as HTMLElement;
  private toast = document.getElementById('toast') as HTMLElement;
  private btnResetCamera = document.getElementById('btn-reset-camera') as HTMLElement;

  private currentTooltipRoom: Room | null = null;
  private toastTimeout: number | null = null;

  constructor() {
    const canvasContainer = document.getElementById('canvas-container') as HTMLElement;

    // 1. Initialize 3D Scene
    this.sceneManager = new SceneManager(canvasContainer);

    // 2. Build Procedural Architecture
    this.buildingRenderer = new BuildingRenderer(this.campusData);
    this.sceneManager.scene.add(this.buildingRenderer.rootGroup);

    // 3. Explode Controller
    this.explodeController = new ExplodeController(this.buildingRenderer);

    // 4. Route Renderer
    this.routeRenderer = new RouteRenderer(this.sceneManager.scene);

    // 5. Pathfinder
    this.pathfinder = new AStarPathfinder(this.campusData);

    // 6. Raycast Picker
    this.raycastPicker = new RaycastPicker(
      this.sceneManager.camera,
      this.sceneManager.renderer.domElement,
      this.buildingRenderer
    );

    // 7. UI Modules
    this.themeManager = new ThemeManager();
    this.searchPanel = new SearchPanel(this.campusData);
    this.floorControl = new FloorControl(this.explodeController);
    this.stepGuide = new StepGuide();

    // 8. Bind System Interactivity
    this.setupInteractions();
  }

  private setupInteractions() {
    // Theme switching
    this.themeManager.onThemeChange((isDark) => {
      this.sceneManager.setDarkTheme(isDark);
      this.buildingRenderer.setDarkTheme(isDark);
      this.routeRenderer.setDarkTheme(isDark);
    });

    // Real-time route & pin marker position update during floor explode animation
    this.explodeController.onUpdateCallback = () => {
      this.routeRenderer.updatePositions();
    };

    // Reset camera button
    if (this.btnResetCamera) {
      this.btnResetCamera.addEventListener('click', () => {
        this.sceneManager.resetCamera();
        this.floorControl.selectFloor('all');
        this.buildingRenderer.highlightRoom(null);
        this.hideTooltip();
      });
    }

    // 3D Pick mode toggles from search panel
    this.searchPanel.onPickModeToggle = (mode) => {
      if (mode === 'start') {
        this.raycastPicker.currentMode = 'pick_start';
        this.showToast('3D空間上の教室をクリックして【出発地】に設定してください');
      } else if (mode === 'dest') {
        this.raycastPicker.currentMode = 'pick_dest';
        this.showToast('3D空間上の教室をクリックして【目的地】に設定してください');
      } else {
        this.raycastPicker.currentMode = 'normal';
        this.hideToast();
      }
    };

    // 3D Room click event
    this.raycastPicker.onRoomSelect = (room, mode, clientX, clientY) => {
      if (mode === 'pick_start') {
        this.searchPanel.setStart(room.entranceNodeId, room.name);
        this.raycastPicker.currentMode = 'normal';
        this.showToast(`出発地に「${room.name}」を設定しました`);
        this.focusOnRoom(room);
        return;
      }

      if (mode === 'pick_dest') {
        this.searchPanel.setDest(room.entranceNodeId, room.name);
        this.raycastPicker.currentMode = 'normal';
        this.showToast(`目的地に「${room.name}」を設定しました`);
        this.focusOnRoom(room);
        return;
      }

      // Normal mode -> Show tooltip popup
      this.currentTooltipRoom = room;
      this.showTooltip(room, clientX, clientY);
      this.buildingRenderer.highlightRoom(room.id);
    };

    this.raycastPicker.onBackgroundClick = () => {
      this.hideTooltip();
    };

    // Tooltip action buttons
    this.btnTooltipStart.addEventListener('click', () => {
      if (this.currentTooltipRoom) {
        this.searchPanel.setStart(this.currentTooltipRoom.entranceNodeId, this.currentTooltipRoom.name);
        this.hideTooltip();
        this.showToast(`出発地に「${this.currentTooltipRoom.name}」を設定しました`);
      }
    });

    this.btnTooltipDest.addEventListener('click', () => {
      if (this.currentTooltipRoom) {
        this.searchPanel.setDest(this.currentTooltipRoom.entranceNodeId, this.currentTooltipRoom.name);
        this.hideTooltip();
        this.showToast(`目的地に「${this.currentTooltipRoom.name}」を設定しました`);
      }
    });

    // Search room focus
    this.searchPanel.onRoomFocus = (roomId) => {
      const record = this.buildingRenderer.roomMeshRecords.get(roomId);
      if (record) {
        this.focusOnRoom(record.room);
      }
    };

    // Route search request
    this.searchPanel.onRouteSearch = (startId, destId, filter) => {
      this.executeRouteSearch(startId, destId, filter);
    };

    // Step guide item click
    this.stepGuide.onStepClick = (step: RouteStep) => {
      const stepPos = new THREE.Vector3(...step.position);
      const camOffset = new THREE.Vector3(18, 16, 22);
      this.sceneManager.flyTo(stepPos, stepPos.clone().add(camOffset), 700);

      // Expand to this step's floor if it's in a building
      if (step.floor) {
        this.floorControl.selectFloor(step.floor);
      }
    };
  }

  private executeRouteSearch(startId: string, destId: string, filter: RouteFilterType) {
    const result = this.pathfinder.findPath(startId, destId, filter);

    if (!result || result.pathNodes.length < 2) {
      this.showToast('ルートが見つかりませんでした。条件を変更してお試しください。');
      this.routeRenderer.clearRoute();
      this.searchPanel.hideSummary();
      this.stepGuide.hide();
      return;
    }

    // 1. Draw 3D pulse route with dynamic floor explode position resolver
    this.routeRenderer.renderRoute(result.pathNodes, (node) => {
      return this.buildingRenderer.getNodeWorldPosition(node);
    });

    // 2. Update summary metrics in UI
    this.searchPanel.updateSummary(result);

    // 3. Show step-by-step guidance cards
    this.stepGuide.showSteps(result.steps);

    // 4. Calculate bounding center of route and adjust camera
    const box = new THREE.Box3();
    result.pathNodes.forEach(node => {
      box.expandByPoint(new THREE.Vector3(...node.position));
    });
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.z, 25);
    const camOffset = new THREE.Vector3(maxDim * 0.9, maxDim * 1.0, maxDim * 1.1);

    this.sceneManager.flyTo(center, center.clone().add(camOffset), 1100);

    // Highlight destination room if exists
    const destNode = this.pathfinder.getNode(destId);
    if (destNode) {
      // Find matching room
      for (const record of this.buildingRenderer.roomMeshRecords.values()) {
        if (record.room.entranceNodeId === destId) {
          this.buildingRenderer.highlightRoom(record.room.id);
          break;
        }
      }
    }
  }

  private focusOnRoom(room: Room) {
    const roomPos = this.buildingRenderer.getRoomPosition(room.id);
    if (!roomPos) return;

    // Highlight room
    this.buildingRenderer.highlightRoom(room.id);

    // Open target floor explode view
    this.floorControl.selectFloor(room.floorLevel);

    // Smooth fly to room
    const camOffset = new THREE.Vector3(16, 14, 20);
    this.sceneManager.flyTo(roomPos, roomPos.clone().add(camOffset), 900);
  }

  private showTooltip(room: Room, clientX: number, clientY: number) {
    this.tooltipTitle.textContent = room.name;
    const bldg = this.campusData.buildings.find(b => b.id === room.buildingId);
    const bldgName = bldg ? bldg.name : '';
    const cap = room.capacity ? ` (定員 ${room.capacity}名)` : '';
    this.tooltipDesc.textContent = `${bldgName} ${room.floorLevel}F${cap} - ${room.description || ''}`;

    this.tooltip.style.left = `${clientX}px`;
    this.tooltip.style.top = `${clientY}px`;
    this.tooltip.classList.remove('hidden');
  }

  private hideTooltip() {
    this.tooltip.classList.add('hidden');
    this.currentTooltipRoom = null;
  }

  private showToast(message: string, duration: number = 3200) {
    this.toast.textContent = message;
    this.toast.classList.remove('hidden');

    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = window.setTimeout(() => {
      this.toast.classList.add('hidden');
    }, duration);
  }

  private hideToast() {
    this.toast.classList.add('hidden');
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }
}

// Bootstrap application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  new UniviewApp();
});
