// Booth-proofing: stop every browser gesture that could scroll, zoom, select text, open a
// menu or navigate away. (CSS handles touch-action, overscroll-behavior and user-select.)

export function installGuards(): void {
  const stop = (e: Event): void => e.preventDefault();
  const opts: AddEventListenerOptions = { passive: false };
  document.addEventListener('contextmenu', stop);
  document.addEventListener('selectstart', stop);
  document.addEventListener('dragstart', stop);
  document.addEventListener('dblclick', stop, opts);
  document.addEventListener('touchmove', stop, opts);
  // Safari pinch gestures.
  document.addEventListener('gesturestart', stop, opts);
  document.addEventListener('gesturechange', stop, opts);
  // Ctrl/Cmd + wheel and trackpad pinch zoom.
  document.addEventListener('wheel', stop, opts);
  // Ctrl/Cmd + plus, minus, zero.
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
  });
}
