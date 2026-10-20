import type { Floor } from "../types/campus";

export class FloorControl {
  public onFloorChange: ((floor: number) => void) | null = null;
  public onExplodeChange: ((ratio: number) => void) | null = null;
  public onShowAllChange: ((all: boolean) => void) | null = null;
  constructor() {
    document
      .getElementById("explode-slider")!
      .addEventListener("input", (e) =>
        this.onExplodeChange?.(
          Number((e.target as HTMLInputElement).value) / 100,
        ),
      );
    document
      .getElementById("show-all-floors")!
      .addEventListener("change", (e) =>
        this.onShowAllChange?.((e.target as HTMLInputElement).checked),
      );
  }
  public render(floors: Floor[], level: number | null) {
    const container = document.getElementById("floor-buttons")!;
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
}
