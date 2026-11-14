import { useEffect, useRef, useState } from 'preact/hooks';

import { playSfx } from '../../platform/audio';
import { rejectMessage } from './duelHudText';
import type { DuelHudBus, DuelHudPhase, DuelHudRejectReason } from './types';

/** How long the reason text and the card shake stay visible (spec 3.4 feedback). */
const REJECTION_VISIBLE_MS = 900;
/** How long a phase banner stays on screen; matches the campaign wave banner. */
const BANNER_VISIBLE_MS = 3200;
/** How long "Fight!" stays after the countdown. */
const FIGHT_VISIBLE_MS = 900;

/** A phase banner on screen; `nonce` restarts the slide animation (spec 18.2). */
export interface DuelBannerView {
  readonly phase: 'overdrive' | 'suddenDeath';
  readonly nonce: number;
}

/** The rejection toast and the hand slot that shakes with it. */
export interface RejectionState {
  readonly message: string | null;
  readonly slot: number | null;
  readonly nonce: number;
}

/** Feedback state of the Duel HUD. */
export interface DuelFeedback {
  readonly rejection: RejectionState | null;
  readonly banner: DuelBannerView | null;
  readonly showFight: boolean;
  reject(reason: DuelHudRejectReason, slot: number | null): void;
}

/** Shows a short-lived value: `show` sets it and clears it after `visibleMs`. */
function useTimedValue<Value>(visibleMs: number): [Value | null, (value: Value) => void] {
  const [value, setValue] = useState<Value | null>(null);
  const timer = useRef(0);
  useEffect((): (() => void) => (): void => window.clearTimeout(timer.current), []);
  const show = (next: Value): void => {
    window.clearTimeout(timer.current);
    setValue(next);
    timer.current = window.setTimeout(() => setValue(null), visibleMs);
  };
  return [value, show];
}

/** Subscribes to the per-tick HUD events: sim rejections and phase changes. */
function useDuelEvents(
  bus: DuelHudBus,
  onReject: (reason: DuelHudRejectReason) => void,
  onPhase: (phase: DuelHudPhase) => void,
): void {
  const handlers = useRef({ onReject, onPhase });
  handlers.current = { onReject, onPhase };
  useEffect((): (() => void) => {
    bus.listener = (events): void => {
      for (const event of events) {
        if (event.type === 'commandRejected') {
          handlers.current.onReject(event.reason);
        } else if (event.type === 'phaseChanged') {
          handlers.current.onPhase(event.phase);
        }
      }
    };
    return (): void => {
      bus.listener = null;
    };
  }, [bus]);
}

/**
 * Rejection toast and card shake (spec 3.4, 18.5), "Fight!" after the countdown and
 * the OVERDRIVE banner with the horn (spec 18.2). A sim rejection shakes the slot of
 * the last play the host passed on.
 */
export function useDuelFeedback(
  bus: DuelHudBus,
  lastPlayedSlot: { readonly current: number | null },
): DuelFeedback {
  const [rejection, showRejection] = useTimedValue<RejectionState>(REJECTION_VISIBLE_MS);
  const [banner, showBanner] = useTimedValue<DuelBannerView>(BANNER_VISIBLE_MS);
  const [fight, showFight] = useTimedValue<true>(FIGHT_VISIBLE_MS);
  const nonce = useRef(0);
  const reject = (reason: DuelHudRejectReason, slot: number | null): void => {
    nonce.current += 1;
    showRejection({ message: rejectMessage(reason), slot, nonce: nonce.current });
  };
  useDuelEvents(
    bus,
    (reason) => reject(reason, lastPlayedSlot.current),
    (phase) => {
      nonce.current += 1;
      if (phase === 'regular') {
        showFight(true);
      } else if (phase === 'overdrive' || phase === 'suddenDeath') {
        playSfx('wave_horn');
        showBanner({ phase, nonce: nonce.current });
      }
    },
  );
  return { rejection, banner, showFight: fight === true, reject };
}
