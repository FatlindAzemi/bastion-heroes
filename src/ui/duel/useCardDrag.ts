import { useRef, useState } from 'preact/hooks';

import { playSfx } from '../../platform/audio';
import type { DuelHudStateView } from './types';

/** Finger travel that turns a card press into a drag (input feel, not a game rule). */
const DRAG_THRESHOLD_PX = 12;

/** The ghost card that follows the finger while dragging. */
export interface DragGhost {
  readonly cardId: string;
  readonly x: number;
  readonly y: number;
}

/** A card press that may become a drag onto the board (spec 18.5). */
interface CardPress {
  readonly slot: number;
  readonly startX: number;
  readonly startY: number;
  readonly wasHeld: boolean;
  moved: boolean;
}

/** What the drag hook needs from the HUD. */
export interface CardDragOptions {
  readonly heldSlot: number | null;
  readonly setHeldSlot: (slot: number | null) => void;
  readonly playAt: (slot: number, clientX: number, clientY: number) => void;
  readonly readState: () => DuelHudStateView;
}

/** Pointer handlers of the hand cards plus the drag ghost. */
export interface CardDrag {
  readonly ghost: DragGhost | null;
  readonly onCardPointerDown: (slot: number, event: PointerEvent) => void;
  readonly onCardPointerMove: (event: PointerEvent) => void;
  readonly onCardPointerUp: (event: PointerEvent) => void;
}

/** True when the pointer is released over the hand tray (a drop there cancels the drag). */
function isOverTray(event: PointerEvent): boolean {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  return element?.closest('.duel-tray') !== null && element !== null;
}

/**
 * A press on a card holds it; moving the finger further than the threshold turns it
 * into a drag, and releasing over the board plays it there (spec 18.5). A short tap
 * on the already held card lets go of it.
 */
export function useCardDrag(options: CardDragOptions): CardDrag {
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const press = useRef<CardPress | null>(null);
  return {
    ghost,
    onCardPointerDown: (slot, event): void => {
      if (options.readState().ended) {
        return;
      }
      const target = event.currentTarget as HTMLElement | null;
      target?.setPointerCapture?.(event.pointerId);
      const wasHeld = options.heldSlot === slot;
      press.current = { slot, startX: event.clientX, startY: event.clientY, wasHeld, moved: false };
      if (!wasHeld) {
        playSfx('card_select');
        options.setHeldSlot(slot);
      }
    },
    onCardPointerMove: (event): void => {
      const current = press.current;
      if (current === null) {
        return;
      }
      const travel = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
      current.moved = current.moved || travel > DRAG_THRESHOLD_PX;
      const cardId = options.readState().hand[current.slot];
      if (current.moved && cardId !== undefined) {
        setGhost({ cardId, x: event.clientX, y: event.clientY });
      }
    },
    onCardPointerUp: (event): void => {
      const current = press.current;
      press.current = null;
      setGhost(null);
      if (current?.moved === true && !isOverTray(event)) {
        options.playAt(current.slot, event.clientX, event.clientY);
      } else if (current?.moved === false && current.wasHeld) {
        options.setHeldSlot(null);
      }
    },
  };
}
