/**
 * Runs a callback once per rendered animation frame.
 * Replaced by the fixed 30 Hz game loop in milestone M1 (issue 1.10, spec 11.4).
 */
export function startRenderLoop(onFrame: (deltaMs: number) => void): void {
  let lastTimeMs = performance.now();
  const frame = (timeMs: number): void => {
    onFrame(timeMs - lastTimeMs);
    lastTimeMs = timeMs;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
