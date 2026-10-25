const THEME_STORAGE_KEY = "cartelyra_theme";
const LEGACY_THEME_STORAGE_KEY = "uniview_theme";

export class ThemeManager {
  private isDark: boolean = false;
  private onChangeCallbacks: Array<(isDark: boolean) => void> = [];

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved !== "dark" && saved !== "light") {
        saved = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
        if (saved === "dark" || saved === "light")
          localStorage.setItem(THEME_STORAGE_KEY, saved);
      }
    } catch {
      /* Storage can be unavailable in private or embedded contexts. */
    }
    if (saved === "dark" || saved === "light") {
      this.isDark = saved === "dark";
    } else {
      // Check system preference
      this.isDark =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    this.applyTheme();
    this.setupButton();
  }

  private setupButton() {
    const btn = document.getElementById("btn-theme-toggle");
    if (btn) {
      btn.addEventListener("click", () => {
        this.toggleTheme();
      });
    }
  }

  public toggleTheme() {
    this.isDark = !this.isDark;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, this.isDark ? "dark" : "light");
    } catch {
      /* Theme still works for this visit. */
    }
    this.applyTheme();
  }

  private applyTheme() {
    if (this.isDark) {
      document.body.classList.remove("theme-light");
      document.body.classList.add("theme-dark");
    } else {
      document.body.classList.remove("theme-dark");
      document.body.classList.add("theme-light");
    }

    for (const cb of this.onChangeCallbacks) {
      cb(this.isDark);
    }
  }

  public onThemeChange(callback: (isDark: boolean) => void) {
    this.onChangeCallbacks.push(callback);
    callback(this.isDark);
  }

  public getIsDark(): boolean {
    return this.isDark;
  }
}
