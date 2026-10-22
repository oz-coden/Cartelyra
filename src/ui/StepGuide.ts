import type { RouteStep, NavEdgeType } from "../types/campus";

export class StepGuide {
  private container = document.getElementById("step-guide") as HTMLElement;
  private stepCountBadge = document.getElementById(
    "guide-step-count",
  ) as HTMLElement;
  private stepList = document.getElementById("step-guide-list") as HTMLElement;
  private btnClose = document.getElementById("btn-close-guide") as HTMLElement;

  public onStepClick: ((step: RouteStep) => void) | null = null;

  constructor() {
    this.setupEvents();
  }

  private setupEvents() {
    this.btnClose.addEventListener("click", () => {
      this.hide();
    });
  }

  public showSteps(steps: RouteStep[]) {
    if (!steps || steps.length === 0) {
      this.hide();
      return;
    }

    this.stepCountBadge.textContent = `全 ${steps.length} ステップ`;
    this.stepList.innerHTML = "";

    steps.forEach((step, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "step-card";
      if (index === 0) card.classList.add("active");

      const icon = this.getStepIcon(
        step.edgeType,
        index === 0,
        index === steps.length - 1,
      );
      const typeLabel = this.getTypeLabel(
        step.edgeType,
        index === 0,
        index === steps.length - 1,
      );

      for (const [className, text] of [
        ["step-card-num", `STEP ${step.stepNumber} ${icon}`],
        ["step-card-text", step.instruction],
        [
          "step-card-footer",
          `${typeLabel}${step.cover === "covered" ? " / 屋根付き" : ""}${step.distance > 0 ? ` / ${step.distance}m` : ""}`,
        ],
      ]) {
        const part = document.createElement("span");
        part.className = className;
        part.textContent = text;
        card.append(part);
      }

      card.addEventListener("click", () => {
        const allCards = this.stepList.querySelectorAll(".step-card");
        allCards.forEach((c) => c.classList.remove("active"));
        card.classList.add("active");

        if (this.onStepClick) {
          this.onStepClick(step);
        }
      });

      this.stepList.appendChild(card);
    });

    this.container.classList.remove("hidden");
  }

  public hide() {
    this.container.classList.add("hidden");
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
        return "エレベーター";
      case "bridge":
        return "連絡通路";
      case "outdoor":
        return "屋外通路";
      default:
        return "フロア内移動";
    }
  }
}
