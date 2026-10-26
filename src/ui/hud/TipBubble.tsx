import { useEffect, useState } from 'preact/hooks';

import { Icon } from '../components/Icon';
import type { HudTipView } from './types';

/** Props of the first-time tutorial bubble. */
export interface TipBubbleProps {
  readonly tip: HudTipView;
}

/** Seconds a tip stays up before it hides itself (the save has marked it seen already). */
const TIP_AUTO_HIDE_MS = 12_000;

/**
 * Non-blocking first-time tip of W1-L01 to W1-L04 (spec 4.9, M4 design decision):
 * a small frosted bubble under the status bar with one sentence and a dismiss
 * button. It never blocks input; the player can keep placing defenders while it is
 * visible, and it hides on its own after a few seconds.
 */
export function TipBubble({ tip }: TipBubbleProps) {
  const [visible, setVisible] = useState(true);
  useEffect((): (() => void) => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), TIP_AUTO_HIDE_MS);
    return (): void => window.clearTimeout(timer);
  }, [tip.id]);
  if (!visible) {
    return null;
  }
  return (
    <aside
      class="hud-tip"
      data-testid="hud-tip"
      data-tip-id={tip.id}
      role="note"
      aria-label="Tutorial tip"
    >
      <span class="hud-tip__badge" aria-hidden="true">
        <Icon name="crest" class="hud-tip__icon" />
      </span>
      <span class="hud-tip__text">{tip.text}</span>
      <button
        type="button"
        class="hud-tip__close"
        aria-label="Dismiss tip"
        data-testid="hud-tip-dismiss"
        onClick={(): void => setVisible(false)}
      >
        <Icon name="close" class="hud-tip__close-icon" />
      </button>
    </aside>
  );
}
