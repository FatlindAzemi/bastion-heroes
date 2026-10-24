/**
 * Performance numbers reported by `renderer.info` plus the measured fps, shown in a
 * dev overlay toggled with the backquote key (spec 11.7; the `?perf=1` URL parameter
 * of spec 16.6 shows it immediately). Numbers are refreshed about four times a second.
 */
export interface DebugStats {
  /** Draw calls of the last rendered frame (`renderer.info.render.calls`). */
  readonly drawCalls: number;
  /** Triangles of the last rendered frame (`renderer.info.render.triangles`). */
  readonly triangles: number;
}

/** The debug overlay handle the renderer updates after every frame. */
export interface DebugOverlay {
  /** Records one rendered frame; updates the visible text when enough time has passed. */
  recordFrame(nowMs: number, stats: DebugStats): void;
  dispose(): void;
}

/** Text is refreshed this often, so reading it never costs a DOM write per frame. */
const UPDATE_INTERVAL_MS = 250;

/** FPS is averaged over this window (two or more full frames at 60 fps). */
const FPS_WINDOW_MS = 500;

/** Creates the top-left stats overlay and binds the backquote key (spec 11.7). */
export function createDebugOverlay(
  container: HTMLElement,
  initiallyVisible: boolean,
): DebugOverlay {
  const element = document.createElement('pre');
  element.id = 'debug-overlay';
  element.style.cssText = [
    'position: fixed',
    'top: 8px',
    'left: 8px',
    'z-index: 10',
    'margin: 0',
    'padding: 6px 8px',
    'border-radius: 6px',
    'background: rgba(27, 27, 47, 0.72)',
    'color: #f4fbff',
    'font: 12px/1.4 ui-monospace, SFMono-Regular, monospace',
    'pointer-events: none',
    'white-space: pre',
  ].join('; ');
  element.hidden = !initiallyVisible;
  container.appendChild(element);

  let visible = initiallyVisible;
  let frames = 0;
  let fps = 0;
  let windowStartMs = performance.now();
  let lastUpdateMs = 0;

  /** Shows or hides the overlay and restarts the fps window, so the first text is fresh. */
  function setVisible(nextVisible: boolean): void {
    visible = nextVisible;
    element.hidden = !visible;
    frames = 0;
    fps = 0;
    windowStartMs = performance.now();
    lastUpdateMs = 0;
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Backquote') {
      event.preventDefault();
      setVisible(!visible);
    }
  };
  window.addEventListener('keydown', onKeyDown);

  return {
    recordFrame: (nowMs: number, stats: DebugStats): void => {
      if (!visible) {
        return;
      }
      frames += 1;
      if (nowMs - windowStartMs >= FPS_WINDOW_MS) {
        fps = Math.round((frames * 1000) / (nowMs - windowStartMs));
        frames = 0;
        windowStartMs = nowMs;
      }
      if (nowMs - lastUpdateMs < UPDATE_INTERVAL_MS) {
        return;
      }
      lastUpdateMs = nowMs;
      const frameTimeMs = fps > 0 ? (1000 / fps).toFixed(1) : '--';
      element.textContent = [
        `fps ${fps > 0 ? fps : '--'}`,
        `frame ${frameTimeMs} ms`,
        `draw calls ${stats.drawCalls}`,
        `triangles ${stats.triangles.toLocaleString('en-US')}`,
      ].join(' | ');
    },
    dispose: (): void => {
      window.removeEventListener('keydown', onKeyDown);
      element.remove();
    },
  };
}
