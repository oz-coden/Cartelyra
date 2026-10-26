import type { SearchPanel } from "./SearchPanel";
import { scrollToMap } from "./mapScroll.js";

/** Reuses the sidebar's editor in a modal on small screens, preserving one set of inputs. */
export class MobileRoutePanel {
  private editor = document.getElementById("route-editor")!;
  private dialog = document.getElementById("mobile-route-dialog") as HTMLDialogElement;
  private bar = document.getElementById("mobile-route-bar")!;
  private button = document.getElementById("btn-edit-route")!;
  private marker = document.createComment("Route editor position in the desktop sidebar");
  private media = window.matchMedia?.("(max-width: 899px)");

  constructor(private search: SearchPanel) {
    this.editor.before(this.marker);
    this.button.addEventListener("click", () => this.open());
    for (const id of ["btn-close-route-editor", "btn-route-show-map"])
      document.getElementById(id)!.addEventListener("click", () => this.close());
    this.dialog.addEventListener("cancel", event => {
      event.preventDefault();
      this.close();
    });
    this.dialog.addEventListener("close", () => this.finishClose());
    this.dialog.addEventListener("keydown", event => {
      if (event.key !== "Tab") return;
      const controls = [...this.dialog.querySelectorAll<HTMLElement>(
        "button, input, select, textarea, a[href], [tabindex]",
      )].filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      const atBoundary = document.activeElement === (event.shiftKey ? first : last) ||
        (event.shiftKey && document.activeElement?.id === "mobile-route-title");
      if (first && last && atBoundary) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    });
    this.dialog.addEventListener("click", event => {
      if (event.target !== this.dialog) return;
      const box = this.dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right ||
          event.clientY < box.top || event.clientY > box.bottom) this.close();
    });
    this.media?.addEventListener?.("change", () => this.updateLayout());
    window.addEventListener("resize", () => this.updateViewport());
    window.visualViewport?.addEventListener("resize", () => this.updateViewport());
    window.visualViewport?.addEventListener("scroll", () => this.updateViewport());
    this.search.onStateChange = () => this.updateSummary();
    this.updateLayout();
    this.updateSummary();
  }

  private updateLayout() {
    const active = document.activeElement as HTMLElement | null;
    const editing = !!active && this.editor.contains(active);
    if (this.media?.matches) {
      document.getElementById("mobile-route-dialog-body")!.append(this.editor);
      if (editing) this.open();
    } else {
      this.close(false);
      this.marker.after(this.editor);
      if (editing) active!.focus({ preventScroll: true });
    }
  }

  private open() {
    if (!this.media?.matches || this.dialog.hasAttribute("open")) return;
    this.search.cancelPick();
    this.updateViewport();
    document.documentElement.classList.add("route-editor-open");
    if (this.dialog.showModal) this.dialog.showModal();
    else this.dialog.setAttribute("open", "");
    this.button.setAttribute("aria-expanded", "true");
    document.getElementById("mobile-route-title")!.focus({ preventScroll: true });
  }

  public close(returnToMap = true) {
    if (!this.dialog.hasAttribute("open")) return;
    for (const id of ["input-start", "input-dest"])
      (document.getElementById(id) as HTMLInputElement).blur?.();
    if (this.dialog.close) this.dialog.close();
    else this.dialog.removeAttribute("open");
    this.finishClose();
    if (returnToMap) {
      this.button.focus({ preventScroll: true });
      const hasDirections = !document.getElementById("step-guide")!.classList.contains("hidden") ||
        !document.getElementById("btn-reopen-guide")!.classList.contains("hidden");
      if (hasDirections) scrollToMap();
      else this.bar.scrollIntoView?.({ block: "start" });
    }
  }

  private finishClose() {
    if (this.dialog.hasAttribute("open")) return;
    document.documentElement.classList.remove("route-editor-open");
    this.button.setAttribute("aria-expanded", "false");
  }

  private updateViewport() {
    const viewport = window.visualViewport;
    this.dialog.style.setProperty("--route-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
    this.dialog.style.setProperty("--route-viewport-bottom",
      `${viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0}px`);
  }

  private updateSummary() {
    const state = this.search.getState();
    for (const target of ["start", "dest"] as const) {
      const value = state[target], confirmed = state[`${target}Confirmed`];
      document.getElementById(`mobile-route-${target}`)!.textContent = value
        ? `${value}${confirmed ? "" : "（未確定）"}`
        : target === "start" ? "出発地を選択" : "目的地を選択";
    }
    this.button.textContent = state.start || state.dest ? "変更" : "目的地を検索";
    const labels = { shortest: "標準", accessible: "階段を避ける", indoor: "屋内優先", stairs: "階段優先" };
    document.getElementById("mobile-route-conditions")!.textContent =
      `${labels[state.filter]} / ${state.inferred ? "参考ルートを含む" : "確認済みの接続のみ"}`;
    const status = document.getElementById("mobile-route-status")!;
    status.textContent = state.status;
    status.classList.toggle("hidden", !state.status);
    status.dataset.kind = state.statusKind;
  }
}
