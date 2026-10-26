import type { RouteStep, NavEdgeType } from "../types/campus";
import { scrollToMap } from "./mapScroll.js";

export class StepGuide {
  private container = document.getElementById("step-guide") as HTMLElement;
  private stepCountBadge = document.getElementById(
    "guide-step-count",
  ) as HTMLElement;
  private stepList = document.getElementById("step-guide-list") as HTMLElement;
  private btnClose = document.getElementById("btn-close-guide") as HTMLElement;
  private btnReopen = document.getElementById("btn-reopen-guide") as HTMLButtonElement;
  private btnPrev = document.getElementById("btn-guide-prev") as HTMLButtonElement;
  private btnNext = document.getElementById("btn-guide-next") as HTMLButtonElement;
  private steps: RouteStep[] = [];
  private currentIndex = 0;

  public onStepClick: ((step: RouteStep) => void) | null = null;

  constructor() {
    this.setupEvents();
  }

  private setupEvents() {
    this.btnClose.addEventListener("click", () => {
      this.hide();
      this.btnReopen.focus({ preventScroll: true });
    });
    this.btnReopen.addEventListener("click", () => {
      this.show();
      document.getElementById("btn-guide-focus")!.focus({ preventScroll: true });
    });
    this.btnPrev.addEventListener("click", () => this.selectStep(this.currentIndex - 1));
    this.btnNext.addEventListener("click", () => this.selectStep(this.currentIndex + 1));
    document.getElementById("btn-guide-focus")!.addEventListener("click", () => {
      if (this.steps.length) {
        this.onStepClick?.(this.steps[this.currentIndex]);
        scrollToMap();
      }
    });
  }

  public showSteps(steps: RouteStep[]) {
    if (!steps || steps.length === 0) {
      this.clear();
      return;
    }

    this.steps = steps;
    this.currentIndex = 0;
    document.getElementById("guide-all-steps")!.removeAttribute("open");
    this.stepList.replaceChildren();

    steps.forEach((step, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "step-card";

      const icon = this.getStepIcon(
        step.edgeType,
        index === 0,
        index === steps.length - 1,
      );

      for (const [className, text] of [
        ["step-card-num", `STEP ${step.stepNumber} ${icon}`],
        ["step-card-text", step.instruction],
        [
          "step-card-footer",
          this.stepFooter(step, index),
        ],
      ]) {
        const part = document.createElement("span");
        part.className = className;
        part.textContent = text;
        card.append(part);
      }

      card.addEventListener("click", () => {
        this.selectStep(index);
      });

      this.stepList.appendChild(card);
    });

    this.updateCurrent();
    this.show();
  }

  public hide() {
    this.container.classList.add("hidden");
    this.btnReopen.classList.toggle("hidden", !this.steps.length);
    this.btnReopen.setAttribute("aria-expanded", "false");
  }

  public clear() {
    this.steps = [];
    this.currentIndex = 0;
    this.stepList.replaceChildren();
    this.stepCountBadge.textContent = "";
    document.getElementById("guide-current-text")!.textContent = "";
    document.getElementById("guide-current-footer")!.textContent = "";
    this.hide();
  }

  private show() {
    if (!this.steps.length) return;
    this.container.classList.remove("hidden");
    this.btnReopen.classList.add("hidden");
    this.btnReopen.setAttribute("aria-expanded", "true");
  }

  private selectStep(index: number) {
    if (index < 0 || index >= this.steps.length) return;
    this.currentIndex = index;
    this.updateCurrent();
    this.onStepClick?.(this.steps[index]);
  }

  private updateCurrent() {
    const step = this.steps[this.currentIndex];
    this.stepCountBadge.textContent = `${this.currentIndex + 1} / ${this.steps.length} 区間`;
    document.getElementById("guide-current-text")!.textContent = step.instruction;
    document.getElementById("guide-current-footer")!.textContent = this.stepFooter(step, this.currentIndex);
    this.btnPrev.disabled = this.currentIndex === 0;
    this.btnNext.disabled = this.currentIndex === this.steps.length - 1;
    this.stepList.querySelectorAll(".step-card").forEach((card, index) => {
      card.classList.toggle("active", index === this.currentIndex);
      if (index === this.currentIndex) card.setAttribute("aria-current", "step");
      else card.removeAttribute("aria-current");
    });
  }

  private stepFooter(step: RouteStep, index: number) {
    const label = this.getTypeLabel(step.edgeType, index === 0, index === this.steps.length - 1);
    return `${label}${step.cover === "covered" ? " / 屋根付き" : ""}${step.distance > 0 ? ` / ${step.distance}m` : ""}`;
  }

  private getStepIcon(
    type?: NavEdgeType,
    isStart?: boolean,
    isEnd?: boolean,
  ): string {
    if (isStart) return "🟢";
    if (isEnd) return "🏁";
    switch (type) {
      case "stairs":
        return "🪜";
      case "ramp":
        return "↗";
      case "elevator":
        return "🛗";
      case "bridge":
        return "🌉";
      case "outdoor":
        return "🌳";
      default:
        return "🚶‍♂️";
    }
  }

  private getTypeLabel(
    type?: NavEdgeType,
    isStart?: boolean,
    isEnd?: boolean,
  ): string {
    if (isStart) return "出発";
    if (isEnd) return "到着";
    switch (type) {
      case "stairs":
        return "階段移動";
      case "ramp":
        return "スロープ";
      case "elevator":
        return "EV";
      case "bridge":
        return "連絡通路";
      case "outdoor":
        return "屋外通路";
      default:
        return "フロア内移動";
    }
  }
}
