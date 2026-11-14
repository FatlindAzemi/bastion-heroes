import { useRef, useState } from 'preact/hooks';

import { playSfx } from '../../platform/audio';
import { duelCardView } from './duelCards';
import { resolveDuelTap } from './duelTap';
import type { DuelHudBus, DuelHudOptions } from './types';
import { useCardDrag, type DragGhost } from './useCardDrag';
import { useDuelFeedback, type DuelBannerView, type RejectionState } from './useDuelFeedback';

/** HUD behaviour state and handlers for one frame. */
export interface DuelInteraction {
  readonly heldSlot: number | null;
  readonly rejection: RejectionState | null;
  readonly banner: DuelBannerView | null;
  readonly showFight: boolean;
  readonly ghost: DragGhost | null;
  readonly onBoardTap: (event: PointerEvent) => void;
  readonly onCardPointerDown: (slot: number, event: PointerEvent) => void;
  readonly onCardPointerMove: (event: PointerEvent) => void;
  readonly onCardPointerUp: (event: PointerEvent) => void;
  readonly onCardKeyboardSelect: (slot: number) => void;
}

/** The held hand slot, mirrored to the renderer's board highlight (spec 18.9). */
function useHeldSlot(options: DuelHudOptions): [number | null, (slot: number | null) => void] {
  const [heldSlot, setHeldSlotState] = useState<number | null>(null);
  const setHeldSlot = (slot: number | null): void => {
    setHeldSlotState(slot);
    const cardId = slot === null ? undefined : options.readState().hand[slot];
    const card = cardId === undefined ? null : duelCardView(cardId);
    options.actions.setHeldKind(card?.kind ?? null);
  };
  return [heldSlot, setHeldSlot];
}

/**
 * Card selection, drag-and-drop and tap-to-place (spec 18.5: "drags a card onto a
 * tile, or taps the card and then the tile"), with the rejection feedback of 3.4
 * and the phase banners of 18.2.
 */
export function useDuelInteraction(
  options: DuelHudOptions & { readonly bus: DuelHudBus },
): DuelInteraction {
  const [heldSlot, setHeldSlot] = useHeldSlot(options);
  const lastPlayedSlot = useRef<number | null>(null);
  const feedback = useDuelFeedback(options.bus, lastPlayedSlot);

  /** Plays the card of `slot` at a board point and clears the hold (spec 18.5). */
  const playAt = (slot: number, clientX: number, clientY: number): void => {
    const view = options.readState();
    const cardId = view.hand[slot];
    const card = cardId === undefined ? null : duelCardView(cardId);
    const tap = resolveDuelTap(options.pointerToWorld(clientX, clientY), card?.kind ?? null);
    setHeldSlot(null);
    if (tap.kind === 'cancel' || cardId === undefined || view.ended) {
      return;
    }
    const refused = options.actions.play(cardId, tap.lane, tap.col);
    if (refused !== null) {
      feedback.reject(refused, slot);
      return;
    }
    lastPlayedSlot.current = slot;
    playSfx('card_place');
  };

  const drag = useCardDrag({ heldSlot, setHeldSlot, playAt, readState: options.readState });
  return {
    heldSlot,
    rejection: feedback.rejection,
    banner: feedback.banner,
    showFight: feedback.showFight,
    ...drag,
    onBoardTap: (event): void => {
      if (heldSlot !== null) {
        playAt(heldSlot, event.clientX, event.clientY);
      }
    },
    onCardKeyboardSelect: (slot): void => {
      setHeldSlot(heldSlot === slot ? null : slot);
    },
  };
}
