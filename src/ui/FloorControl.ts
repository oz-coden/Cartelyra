import { ThreeDisplayState } from "./ThreeDisplayState.js";
import type { BuildingViewGroup, Floor } from "../types/campus";

export class FloorControl {
  public onFloorChange: ((floor: number) => void) | null = null;
  public onGroupLevelChange: ((id: string) => void) | null = null;
  public onExplodeChange: ((ratio: number) => void) | null = null;
  public onShowAllChange: ((all: boolean) => void) | null = null;
  constructor(private display: ThreeDisplayState = new ThreeDisplayState()) {
    document
      .getElementById("explode-slider")!
      .addEventListener("input", (e) => {
        this.display.setGap(Number((e.target as HTMLInputElement).value) / 100);
        this.renderDisplay();
        this.onExplodeChange?.(this.display.gapRatio);
      });
    document
      .getElementById("show-all-floors")!
      .addEventListener("change", (e) => {
        this.display.showAll = (e.target as HTMLInputElement).checked;
        this.renderDisplay();
        this.onShowAllChange?.(this.display.showAll);
      });
    this.renderDisplay();
  }
  private renderDisplay() {
    (document.getElementById("show-all-floors") as HTMLInputElement).checked =
      this.display.showAll;
    (document.getElementById("explode-slider") as HTMLInputElement).value =
      String(Math.round(this.display.gapRatio * 100));
    document.getElementById("explode-value")!.textContent =
      `${Math.round(this.display.gapRatio * 100)}%`;
    document.getElementById("three-display-status")!.textContent = this.display
      .showAll
      ? "全階表示 / スライダーで階の間隔を変更"
      : "選択階のみ表示 / スライダーを動かすと全階表示";
  }
  public render(floors: Floor[], level: number | null) {
    const container = document.getElementById("floor-buttons")!;
    container.querySelectorAll("[data-group-level]").forEach(b => b.remove());
    for (const button of container.querySelectorAll<HTMLButtonElement>(
      "button",
    ))
      if (!floors.some((f) => String(f.level) === button.dataset.floor))
        button.remove();
    document.getElementById("explode-level-badge")!.textContent =
      floors.find((f) => f.level === level)?.label ?? "未登録";
    let index = 0;
    for (const floor of [...floors].sort(
      (a, b) => (b.stackIndex ?? b.elevation) - (a.stackIndex ?? a.elevation),
    )) {
      let button = [
        ...container.querySelectorAll<HTMLButtonElement>("button"),
      ].find((b) => b.dataset.floor === String(floor.level));
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "floor-btn";
        button.dataset.floor = String(floor.level);
        button.addEventListener("click", () =>
          this.onFloorChange?.(floor.level),
        );
      }
      button.textContent = floor.label;
      button.classList.toggle("active", floor.level === level);
      button.setAttribute("aria-pressed", String(floor.level === level));
      if (container.children[index] !== button)
        container.insertBefore(button, container.children[index] ?? null);
      index++;
    }
  }
  public renderGroup(group: BuildingViewGroup, levelId?: string) {
    const container = document.getElementById("floor-buttons")!;
    for (const button of container.querySelectorAll<HTMLButtonElement>("button"))
      if (!group.levels.some(l => l.id === button.dataset.groupLevel)) button.remove();
    document.getElementById("explode-level-badge")!.textContent = group.levels.find(l => l.id === levelId)?.label ?? "未登録";
    let index = 0;
    for (const level of [...group.levels].reverse()) {
      let button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.dataset.groupLevel === level.id);
      if (!button) {
        button = document.createElement("button");
        button.type = "button"; button.className = "floor-btn"; button.dataset.groupLevel = level.id;
        button.addEventListener("click", () => this.onGroupLevelChange?.(level.id));
      }
      button.textContent = level.label; button.classList.toggle("active", level.id === levelId);
      button.setAttribute("aria-pressed", String(level.id === levelId));
      if (container.children[index] !== button) container.insertBefore(button, container.children[index] ?? null);
      index++;
    }
  }
}
