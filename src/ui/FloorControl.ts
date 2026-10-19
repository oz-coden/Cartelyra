import type { CampusData } from '../types/campus';
import type { ExplodeController } from '../scene/ExplodeController';

export class FloorControl {
  private badge = document.getElementById('explode-level-badge')!;
  private slider = document.getElementById('explode-slider') as HTMLInputElement;
  private buttons: HTMLButtonElement[] = [];
  private labels = new Map<number, string>();
  private active: number | 'all' = 1;
  public onFloorChange: ((floor: number | 'all') => void) | null = null;

  constructor(private controller: ExplodeController | null, campus: CampusData) {
    const container = document.getElementById('floor-buttons')!;
    container.replaceChildren();
    for (const floor of campus.buildings.flatMap(b => b.floors).sort((a, b) => a.elevation - b.elevation)) this.labels.set(floor.level, floor.label);
    for (const [value, label] of [['all', '全階'], ...[...this.labels].map(([level, label]) => [String(level), label])]) {
      const button = document.createElement('button'); button.className = 'floor-btn';
      button.dataset.floor = value; button.textContent = label;
      button.addEventListener('click', () => this.selectFloor(value === 'all' ? 'all' : Number(value)));
      container.append(button); this.buttons.push(button);
    }
    this.slider.addEventListener('input', () => {
      this.selectFloor('all'); this.controller?.setExplodeRatio(Number(this.slider.value) / 100);
    });
    this.selectFloor(1);
  }

  public setController(controller: ExplodeController) { this.controller = controller; this.selectFloor(this.active); }
  public getActiveFloor() { return this.active; }
  public selectFloor(level: number | 'all') {
    if (level !== 'all' && !this.labels.has(level)) return;
    this.active = level;
    for (const button of this.buttons) {
      const active = button.dataset.floor === String(level); button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
    this.badge.textContent = level === 'all' ? '全階' : this.labels.get(level)!;
    this.controller?.setFocusedFloor(level); this.onFloorChange?.(level);
  }
}
