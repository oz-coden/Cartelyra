import { ExplodeController } from '../scene/ExplodeController';

export class FloorControl {
  private badge = document.getElementById('explode-level-badge') as HTMLElement;
  private slider = document.getElementById('explode-slider') as HTMLInputElement;
  private floorButtons: NodeListOf<HTMLButtonElement>;

  public onFloorChange: ((floor: number | 'all') => void) | null = null;

  constructor(private explodeController: ExplodeController) {
    this.floorButtons = document.querySelectorAll<HTMLButtonElement>('.floor-btn');
    this.setupEvents();
  }

  private setupEvents() {
    this.floorButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const floorVal = btn.dataset.floor;
        this.floorButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (floorVal === 'all') {
          this.explodeController.setFocusedFloor('all');
          this.badge.textContent = 'All';
          if (this.onFloorChange) this.onFloorChange('all');
        } else {
          const num = parseInt(floorVal || '1', 10);
          this.explodeController.setFocusedFloor(num);
          this.badge.textContent = `${num}F フォーカス`;
          if (this.onFloorChange) this.onFloorChange(num);
        }
      });
    });

    this.slider.addEventListener('input', () => {
      const val = parseInt(this.slider.value, 10) / 100;
      this.explodeController.setExplodeRatio(val);

      // Reset to 'all' button if slider is adjusted
      const allBtn = Array.from(this.floorButtons).find(b => b.dataset.floor === 'all');
      if (allBtn && !allBtn.classList.contains('active')) {
        this.floorButtons.forEach(b => b.classList.remove('active'));
        allBtn.classList.add('active');
        this.explodeController.setFocusedFloor('all');
      }
      this.badge.textContent = `All (${Math.round(val * 100)}%)`;
    });
  }

  public selectFloor(level: number | 'all') {
    const targetVal = level.toString();
    const btn = Array.from(this.floorButtons).find(b => b.dataset.floor === targetVal);
    if (btn) {
      btn.click();
    }
  }
}
