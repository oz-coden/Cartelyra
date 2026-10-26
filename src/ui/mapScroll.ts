/** Keeps the map and the beginning of its directions together on small screens. */
export function scrollToMap() {
  const map = document.getElementById("map-stage")!;
  if (!window.matchMedia?.("(max-width: 899px)").matches) {
    map.scrollIntoView?.({ block: "nearest" });
    return;
  }

  const guide = document.getElementById("step-guide")!;
  const reopen = document.getElementById("btn-reopen-guide")!;
  const preview = !guide.classList.contains("hidden")
    ? document.getElementById("guide-current-text")!
    : !reopen.classList.contains("hidden") ? reopen : null;
  const viewport = window.visualViewport;
  const offset = viewport?.offsetTop ?? 0;
  const height = viewport?.height ?? window.innerHeight;
  let top = map.getBoundingClientRect().top - offset - 12;
  if (preview) {
    const box = preview.getBoundingClientRect();
    // Expanded lists and long instructions must not push the entire map out of view.
    const previewBottom = Math.min(box.bottom, box.top + 80);
    top = Math.max(top, previewBottom - offset - height + 12);
  }
  window.scrollTo?.({ top: Math.max(0, window.scrollY + top), behavior: "instant" });
}
