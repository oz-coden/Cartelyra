export class ThemeManager {
  private isDark: boolean = false;
  private onChangeCallbacks: Array<(isDark: boolean) => void> = [];

  constructor() {
    const saved = localStorage.getItem('uniview_theme');
    if (saved) {
      this.isDark = saved === 'dark';
    } else {
      // Check system preference
      this.isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    this.applyTheme();
    this.setupButton();
  }

  private setupButton() {
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        this.toggleTheme();
      });
    }
  }

  public toggleTheme() {
    this.isDark = !this.isDark;
    localStorage.setItem('uniview_theme', this.isDark ? 'dark' : 'light');
    this.applyTheme();
  }

  private applyTheme() {
    if (this.isDark) {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
    } else {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
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
