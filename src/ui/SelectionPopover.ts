export interface ScreenPoint {
  x: number;
  y: number;
}

/** An overlay anchored to map coordinates; it never participates in page layout. */
export class SelectionPopover {
  private open = false;
  private observer?: ResizeObserver;
  constructor(
    private element: HTMLElement,
    private stage: HTMLElement,
    private viewport: () => HTMLElement,
    private anchor: () => ScreenPoint | null,
  ) {
    window.addEventListener("resize", () => this.update());
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.update());
      this.observer.observe(stage);
      this.observer.observe(element);
    }
  }
  public show() {
    this.open = true;
    this.element.classList.remove("hidden");
    this.update();
  }
  public hide() {
    this.open = false;
    this.element.classList.add("hidden");
  }
  public update() {
    if (!this.open) return;
    const point = this.anchor();
    this.element.style.visibility = point ? "visible" : "hidden";
    if (!point) return;
    const viewport = this.viewport().getBoundingClientRect();
    const stage = this.stage.getBoundingClientRect();
    const padding = 8,
      gap = 14;
    const width = Math.max(0, Math.min(290, viewport.width - padding * 2));
    this.element.style.width = `${width}px`;
    this.element.style.setProperty(
      "--popover-max-height",
      `${Math.max(0, viewport.height - padding * 2)}px`,
    );
    const height = this.element.getBoundingClientRect().height;
    const above = point.y - viewport.top;
    const below = viewport.bottom - point.y;
    const side =
      above >= height + gap + padding || above > below ? "above" : "below";
    const left = Math.max(
      viewport.left + padding,
      Math.min(point.x - width / 2, viewport.right - padding - width),
    );
    const top = Math.max(
      viewport.top + padding,
      Math.min(
        side === "above" ? point.y - gap - height : point.y + gap,
        viewport.bottom - padding - height,
      ),
    );
    this.element.dataset.side = side;
    this.element.style.left = `${left - stage.left}px`;
    this.element.style.top = `${top - stage.top}px`;
    this.element.style.setProperty(
      "--anchor-x",
      `${Math.max(14, Math.min(width - 14, point.x - left))}px`,
    );
  }
}
