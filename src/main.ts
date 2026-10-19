import './style.css';
import { campusData } from './data/load';
import overviewJson from './data/overview.json';
import type { CampusOverview } from './data/schema';
import type { Room, RouteFilterType, RouteResult } from './types/campus';
import { AStarPathfinder } from './pathfinding/AStar';
import { ThemeManager } from './ui/ThemeManager';
import { SearchPanel } from './ui/SearchPanel';
import { FloorControl } from './ui/FloorControl';
import { StepGuide } from './ui/StepGuide';
import { FloorMap } from './ui/FloorMap';
import type { ThreeView } from './scene/ThreeView';

type View = 'campus' | 'floor' | '3d';
class UniviewApp {
  private three?: ThreeView;
  private loading3D?: Promise<ThreeView>;
  private viewRequest = 0;
  private theme = new ThemeManager();
  private search = new SearchPanel(campusData);
  private floors = new FloorControl(null, campusData);
  private guide = new StepGuide();
  private pathfinder = new AStarPathfinder(campusData);
  private map = new FloorMap(document.getElementById('map-canvas')!, campusData, overviewJson as CampusOverview);
  private view: View = 'floor';
  private pickMode: 'normal' | 'pick_start' | 'pick_dest' = 'normal';
  private selectedRoom: Room | null = null;
  private result: RouteResult | null = null;
  private toastTimer?: number;

  constructor() {
    this.theme.onThemeChange(dark => { this.three?.setTheme(dark); });
    this.floors.onFloorChange = floor => { this.hideTooltip(); if (floor !== 'all') this.map.setFloor(floor); };
    this.map.onRoomSelect = (room, x, y) => this.selectRoom(room, x, y);
    this.map.onBackgroundClick = () => this.hideTooltip();
    this.map.onBuildingSelect = () => this.setView('floor');
    this.search.onRouteSearch = (start, end, filter, inferred) => this.searchRoute(start, end, filter, inferred);
    this.search.onRouteClear = () => { this.result = null; this.map.setRoute(null); this.three?.renderRoute(null); this.guide.hide(); };
    this.search.onRoomFocus = id => {
      const room = campusData.buildings.flatMap(b => b.floors.flatMap(f => f.rooms)).find(r => r.id === id);
      if (room) this.focusRoom(room);
    };
    this.search.onPickModeToggle = mode => {
      this.pickMode = mode === 'start' ? 'pick_start' : mode === 'dest' ? 'pick_dest' : 'normal';
      if (this.three) this.three.picker.currentMode = this.pickMode;
      if (this.view === 'campus' && mode !== 'none') this.setView('floor');
      if (mode !== 'none') this.toast(`地図の部屋を選んで${mode === 'start' ? '出発地' : '目的地'}に設定してください`);
    };
    for (const view of ['campus', 'floor', '3d'] as View[]) document.getElementById(`btn-view-${view}`)!.addEventListener('click', () => this.setView(view));
    document.getElementById('btn-reset-camera')!.addEventListener('click', () => { this.three?.reset(); this.map.resetView(); this.hideTooltip(); });
    for (const target of ['start', 'dest'] as const) document.getElementById(`btn-tooltip-set-${target}`)!.addEventListener('click', () => {
      const room = this.selectedRoom;
      if (!room?.entranceNodeId) return;
      if (target === 'start') this.search.setStart(room.entranceNodeId, room.name); else this.search.setDest(room.entranceNodeId, room.name);
      this.hideTooltip();
    });
    this.guide.onStepClick = step => {
      this.floors.selectFloor(step.floor);
      if (this.view === '3d') this.three?.focusStep(step);
    };
    this.setView('floor');
  }

  private initialize3D(): Promise<ThreeView> {
    if (this.three) return Promise.resolve(this.three);
    if (!this.loading3D) this.loading3D = import('./scene/ThreeView').then(({ ThreeView }) => {
      const view = new ThreeView(campusData, document.getElementById('canvas-container')!);
      this.three = view;
      view.picker.onRoomSelect = (room, _mode, x, y) => this.selectRoom(room, x, y);
      view.picker.onBackgroundClick = () => this.hideTooltip();
      this.floors.setController(view.explode);
      view.setTheme(this.theme.getIsDark()); view.renderRoute(this.result);
      return view;
    }).catch(error => { this.loading3D = undefined; throw error; });
    return this.loading3D;
  }

  private async setView(view: View) {
    const request = ++this.viewRequest;
    if (view === '3d') {
      try { await this.initialize3D(); }
      catch { this.toast('この環境では3D表示を開始できませんでした。平面図を利用できます。'); return; }
    }
    if (request !== this.viewRequest) { this.three?.setActive(this.view === '3d'); return; }
    this.view = view; this.hideTooltip();
    this.three?.setActive(view === '3d');
    document.body.dataset.view = view;
    document.getElementById('map-panel')!.classList.toggle('hidden', view === '3d');
    document.getElementById('canvas-container')!.classList.toggle('hidden', view !== '3d');
    document.getElementById('floor-control')!.classList.toggle('hidden', view === 'campus');
    for (const key of ['campus', 'floor', '3d']) document.getElementById(`btn-view-${key}`)!.setAttribute('aria-pressed', String(key === view));
    if (view !== '3d') this.map.showOverview(view === 'campus');
    if (view === 'floor' && this.floors.getActiveFloor() === 'all') this.floors.selectFloor(1);
  }

  private searchRoute(start: string, end: string, filter: RouteFilterType, allowInferred: boolean) {
    const result = this.pathfinder.findPath(start, end, filter, allowInferred);
    this.result = result; this.map.setRoute(result);
    if (!result) {
      this.three?.renderRoute(null); this.search.hideSummary(); this.guide.hide();
      this.toast(allowInferred ? 'この条件の経路は未登録です。' : '現地確認済みの接続だけでは経路がつながっていません。参考ルートを有効にすると推定経路を確認できます。', 6500); return;
    }
    this.search.updateSummary(result); this.guide.showSteps(result.steps);
    this.three?.renderRoute(result);
    if (this.view === 'campus') this.setView('floor');
    this.floors.selectFloor(result.pathNodes[0].floor);
  }

  private focusRoom(room: Room) {
    if (this.view === 'campus') this.setView('floor');
    this.floors.selectFloor(room.floorLevel); this.map.selectRoom(room.id);
    if (this.view === '3d') this.three?.focusRoom(room);
  }

  private selectRoom(room: Room, x: number, y: number) {
    this.focusRoom(room);
    if (this.pickMode !== 'normal') {
      if (!room.entranceNodeId) { this.toast('この部屋は入口の接続先が未確認です。'); return; }
      if (this.pickMode === 'pick_start') this.search.setStart(room.entranceNodeId, room.name); else this.search.setDest(room.entranceNodeId, room.name);
      this.pickMode = 'normal'; if (this.three) this.three.picker.currentMode = 'normal'; return;
    }
    this.selectedRoom = room;
    document.getElementById('tooltip-title')!.textContent = room.name;
    const floor = campusData.buildings[0].floors.find(f => f.level === room.floorLevel)!;
    document.getElementById('tooltip-desc')!.textContent = `3号館 ${floor.label} / ${room.description ?? (room.entranceNodeId ? '入口は推定位置・利用条件未確認' : '入口の接続先が未確認のため経路未登録')}`;
    for (const id of ['btn-tooltip-set-start', 'btn-tooltip-set-dest']) (document.getElementById(id) as HTMLButtonElement).disabled = !room.entranceNodeId;
    const tooltip = document.getElementById('room-tooltip')!;
    tooltip.style.left = `${Math.max(150, Math.min(window.innerWidth - 150, x))}px`;
    tooltip.style.top = `${Math.max(220, Math.min(window.innerHeight - 20, y))}px`;
    tooltip.classList.remove('hidden');
  }
  private hideTooltip() { document.getElementById('room-tooltip')!.classList.add('hidden'); this.selectedRoom = null; }
  private toast(message: string, duration = 4500) {
    const toast = document.getElementById('toast')!; toast.textContent = message; toast.classList.remove('hidden');
    window.clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => toast.classList.add('hidden'), duration);
  }
}
window.addEventListener('DOMContentLoaded', () => new UniviewApp());
