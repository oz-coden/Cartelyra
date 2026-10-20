/** Display mode is independent of the selected place or route endpoints. */
export class ThreeDisplayState {
  public showAll = true;
  public gapRatio = 0;
  public setGap(ratio: number) {
    this.gapRatio = Math.max(
      0,
      Math.min(1, Number.isFinite(ratio) ? ratio : 0),
    );
    this.showAll = true;
  }
}
