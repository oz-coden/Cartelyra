import type { CampusData, Floor, NavNode, Point2, Room, RouteResult } from '../types/campus';
import type { CampusOverview } from '../data/schema';
import { bounds, worldToLocal } from '../data/geometry';

const NS = 'http://www.w3.org/2000/svg';
function element<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, text?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  if (text !== undefined) node.textContent = text;
  return node;
}
const points = (polygon: Point2[]) => polygon.map(p => p.join(',')).join(' ');

/** SVG is also usable when WebGL is unavailable. Coordinates stay in each building's local frame. */
export class FloorMap {
  private svg = element('svg', { role: 'group', 'aria-label': '3号館 平面図', viewBox: '-8 -8 141 112' });
  private floor: Floor;
  private result: RouteResult | null = null;
  private selectedRoom: string | null = null;
  private overviewMode = false;
  private viewBox = [-8, -8, 141, 112];
  public onRoomSelect: ((room: Room, x: number, y: number) => void) | null = null;
  public onBuildingSelect: (() => void) | null = null;
  public onBackgroundClick: (() => void) | null = null;

  constructor(container: HTMLElement, private campus: CampusData, private overview: CampusOverview) {
    this.floor = campus.buildings[0].floors.find(f => f.level === 1)!;
    container.append(this.svg); this.setupPanZoom(); this.render();
  }
  public setFloor(level: number) {
    const floor = this.campus.buildings[0].floors.find(f => f.level === level);
    if (floor) { this.floor = floor; this.render(); }
  }
  public showOverview(show: boolean) { this.overviewMode = show; this.resetView(); this.render(); }
  public setRoute(result: RouteResult | null) { this.result = result; this.render(); }
  public selectRoom(id: string | null) { this.selectedRoom = id; this.render(); }
  public resetView() {
    this.viewBox = this.overviewMode ? [15, 7, 85, 95] : [-8, -8, 141, 112]; this.applyViewBox();
  }
  public zoom(factor: number) {
    const [x, z, w, h] = this.viewBox, newW = Math.min(300, Math.max(20, w * factor)), ratio = newW / w;
    this.viewBox = [x + (w - newW) / 2, z + (h - h * ratio) / 2, newW, h * ratio]; this.applyViewBox();
  }
  private applyViewBox() { this.svg.setAttribute('viewBox', this.viewBox.join(' ')); }
  private setupPanZoom() {
    let start: { x: number; y: number; box: number[] } | null = null, dragged = false;
    this.svg.addEventListener('pointerdown', e => { if (e.button !== 0) return; start = { x: e.clientX, y: e.clientY, box: [...this.viewBox] }; dragged = false; });
    this.svg.addEventListener('pointermove', e => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < 6 && !dragged) return;
      dragged = true; this.svg.setPointerCapture(e.pointerId);
      // preserveAspectRatio=meet uses the same scale along both axes.
      const rect = this.svg.getBoundingClientRect(), scale = Math.min(rect.width / start.box[2], rect.height / start.box[3]);
      this.viewBox = [start.box[0] - dx / scale, start.box[1] - dy / scale, start.box[2], start.box[3]]; this.applyViewBox();
    });
    this.svg.addEventListener('pointerup', () => { start = null; });
    this.svg.addEventListener('pointercancel', () => { start = null; dragged = false; });
    this.svg.addEventListener('click', e => { if (dragged) { e.stopImmediatePropagation(); dragged = false; } }, true);
    this.svg.addEventListener('click', e => { if (e.target === this.svg) this.onBackgroundClick?.(); });
    this.svg.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    document.getElementById('map-zoom-in')!.addEventListener('click', () => this.zoom(0.8));
    document.getElementById('map-zoom-out')!.addEventListener('click', () => this.zoom(1.25));
  }
  private label(text: string, p: Point2, className = 'map-label') {
    this.svg.append(element('text', { x: String(p[0]), y: String(p[1]), class: className, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, text));
  }
  private render() {
    this.svg.replaceChildren(); this.applyViewBox();
    if (this.overviewMode) { this.renderOverview(); return; }
    this.svg.setAttribute('aria-label', `3号館 ${this.floor.label} 平面図（模式図）`);
    document.getElementById('map-heading')!.textContent = `3号館 / ${this.floor.label}`;
    document.getElementById('map-caption')!.textContent = this.floor.notes?.join(' ') ?? '';
    const outline = this.floor.outline!;
    this.svg.append(element('polygon', { points: points(outline), class: 'map-slab' }));
    for (const hole of this.floor.voids ?? []) {
      this.svg.append(element('polygon', { points: points(hole), class: 'map-void' }));
      const b = bounds(hole); this.label('吹抜', [b.x, b.z], 'map-label map-void-label');
    }
    for (const feature of this.floor.features ?? []) {
      const polygon = element('polygon', { points: points(feature.polygon), class: `map-feature map-feature-${feature.type}` });
      polygon.append(element('title', {}, feature.label)); this.svg.append(polygon);
      const b = bounds(feature.polygon);
      const text = feature.type === 'restroom' ? 'WC' : feature.type === 'service' ? '設備等' : feature.type === 'stairs' ? feature.label.split('（')[0] : feature.label;
      this.label(text, [b.x, b.z], 'map-label map-feature-label');
    }
    for (const room of this.floor.rooms) {
      const group = element('g', { tabindex: '0', role: 'button', 'aria-label': room.name + (room.entranceNodeId ? '' : '（経路未登録）'), class: 'map-room' + (this.selectedRoom === room.id ? ' selected' : '') });
      group.append(element('polygon', { points: points(room.polygon!), class: room.entranceNodeId ? '' : 'map-room-unlinked' }), element('title', {}, room.name));
      const box = bounds(room.polygon!);
      group.append(element('text', { x: String(box.x), y: String(box.z), class: 'map-room-label', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, room.id));
      const select = (x: number, y: number) => this.onRoomSelect?.(room, x, y);
      group.addEventListener('click', e => select(e.clientX, e.clientY));
      group.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const rect = group.getBoundingClientRect(); select(rect.x + rect.width / 2, rect.y + rect.height / 2); } });
      this.svg.append(group);
    }
    this.renderRoute();
  }
  private local(node: NavNode): Point2 { return worldToLocal(this.campus.buildings.find(b => b.id === node.buildingId)!, node.position); }
  private renderRoute() {
    if (!this.result) return;
    const nodes = this.result.pathNodes;
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1], b = nodes[i];
      if (a.floor !== this.floor.level || b.floor !== this.floor.level || a.buildingId !== this.campus.buildings[0].id || b.buildingId !== a.buildingId) continue;
      this.svg.append(element('polyline', { points: points([this.local(a), this.local(b)]), class: 'map-route' }));
    }
    const markers = nodes.filter(n => n.floor === this.floor.level && (n.id === nodes[0].id || n.id === nodes.at(-1)!.id || n.type === 'stairs' || n.type === 'elevator'));
    for (const node of markers) {
      const p = this.local(node), start = node.id === nodes[0].id, goal = node.id === nodes.at(-1)!.id;
      const circle = element('circle', { cx: String(p[0]), cy: String(p[1]), r: '1.6', class: `map-route-marker ${start ? 'start' : goal ? 'goal' : 'transfer'}` });
      circle.append(element('title', {}, node.name)); this.svg.append(circle);
    }
  }
  private renderOverview() {
    this.svg.setAttribute('aria-label', '横浜キャンパス 建物配置の模式図');
    document.getElementById('map-heading')!.textContent = '横浜キャンパス';
    document.getElementById('map-caption')!.textContent = '配置図からの模式図・実寸／方位は未校正。3号館を選ぶとフロア図を開きます。他の建物・屋外経路は順次登録予定です。';
    for (const building of this.overview.buildings) {
      const supported = this.campus.buildings.some(b => b.id === building.id);
      const group = element('g', { class: supported ? 'map-campus-building supported' : 'map-campus-building' });
      group.append(element('polygon', { points: points(building.polygon) }), element('title', {}, building.name + (supported ? '：フロア登録済み' : '：配置のみ登録')));
      const box = bounds(building.polygon);
      group.append(element('text', { x: String(box.x), y: String(box.z), 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, building.name));
      if (supported) {
        group.setAttribute('tabindex', '0'); group.setAttribute('role', 'button'); group.setAttribute('aria-label', `${building.name}のフロア図を開く`);
        group.addEventListener('click', () => this.onBuildingSelect?.());
        group.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onBuildingSelect?.(); } });
      }
      this.svg.append(group);
    }
    for (const gate of this.overview.gates) this.label(gate.name, gate.position, 'map-label map-gate');
  }
}
