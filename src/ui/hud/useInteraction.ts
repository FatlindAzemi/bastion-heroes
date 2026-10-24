import { useEffect, useRef, useState } from 'preact/hooks';

import { resolveTap } from './pointerToTile';
import type { HudBus, HudOptions, HudRejectionReason, HudWorldPoint } from './types';

/** Player-facing reason texts of spec 3.4; `invalidTile` covers blocked/empty-tile misses. */
const REJECTION_MESSAGES: Readonly<Record<HudRejectionReason, string>> = {
  notEnoughEssence: 'Not enough Essence',
  onCooldown: 'Recharging',
  tileOccupied: 'Tile occupied',
  invalidTile: 'Invalid tile',
};

/** How long the rejection text and card shake stay visible (spec 3.4 feedback). */
const REJECTION_VISIBLE_MS = 900;

/** Which control should shake when a command is rejected (spec 3.4). */
type ShakeTarget = { readonly kind: 'card'; readonly index: number } | { readonly kind: 'shovel' };

interface RejectionState {
  readonly message: string;
  readonly shake: ShakeTarget | null;
}

/** The HUD behaviour state and handlers derived from the current frame (spec 3.4, 3.5, 3.7). */
export interface HudInteraction {
  readonly selectedCardIndex: number | null;
  readonly shovelActive: boolean;
  readonly rejectionMessage: string | null;
  readonly shakeCardIndex: number | null;
  readonly shovelShaking: boolean;
  readonly onTap: (event: PointerEvent) => void;
  readonly onSelectCard: (index: number) => void;
  readonly onToggleShovel: () => void;
}

/** Re-renders the HUD once per animation frame so it follows the sim state (spec 11.8). */
export function useAnimationRedraw(): void {
  const [, setFrame] = useState(0);
  useEffect((): (() => void) => {
    let request = 0;
    const frame = (): void => {
      setFrame((current) => current + 1);
      request = requestAnimationFrame(frame);
    };
    request = requestAnimationFrame(frame);
    return (): void => cancelAnimationFrame(request);
  }, []);
}

/** Shows the sim's `commandRejected` feedback as a red message and a control shake (spec 3.4). */
function useCommandFeedback(
  bus: HudBus,
  lastAction: { current: ShakeTarget | null },
  setRejection: (rejection: RejectionState | null) => void,
): void {
  useEffect((): (() => void) => {
    let timer = 0;
    bus.listener = (events): void => {
      for (const event of events) {
        if (event.type !== 'commandRejected') {
          continue;
        }
        window.clearTimeout(timer);
        setRejection({ message: REJECTION_MESSAGES[event.reason], shake: lastAction.current });
        lastAction.current = null;
        timer = window.setTimeout(() => setRejection(null), REJECTION_VISIBLE_MS);
      }
    };
    return (): void => {
      bus.listener = null;
      window.clearTimeout(timer);
    };
  }, [bus, lastAction, setRejection]);
}

/**
 * HUD interaction state: card selection, shovel mode, rejected-command feedback and the
 * tap resolver that turns a field tap into a place/shovel/collect/cancel action
 * (spec 3.3, 3.4, 3.7).
 */
export function useInteraction(options: HudOptions & { readonly bus: HudBus }): HudInteraction {
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [shovelActive, setShovelActive] = useState(false);
  const [rejection, setRejection] = useState<RejectionState | null>(null);
  const lastAction = useRef<ShakeTarget | null>(null);
  useCommandFeedback(options.bus, lastAction, setRejection);

  /** Toggles a card: the selected card lifts and glows (spec 3.4). */
  const onSelectCard = (index: number): void => {
    setShovelActive(false);
    setSelectedCardIndex((current) => (current === index ? null : index));
  };

  /** Toggles shovel mode; it clears any selected card (spec 3.7). */
  const onToggleShovel = (): void => {
    setSelectedCardIndex(null);
    setShovelActive((current) => !current);
  };

  /** Resolves one tap on the field and sends the matching command (spec 3.3, 3.4, 3.7). */
  const onTap = (event: PointerEvent): void => {
    const world: HudWorldPoint | null = options.pointerToWorld(event.clientX, event.clientY);
    const command = resolveTap(world, options.readState().orbs, selectedCardIndex, shovelActive);
    if (command.kind === 'collectOrb') {
      options.actions.collectOrb(command.orbId);
      return;
    }
    if (command.kind === 'place') {
      lastAction.current = { kind: 'card', index: command.cardIndex };
      options.actions.place(command.cardIndex, command.lane, command.col);
      setSelectedCardIndex(null);
      return;
    }
    if (command.kind === 'shovel') {
      lastAction.current = { kind: 'shovel' };
      options.actions.shovel(command.lane, command.col);
      setShovelActive(false);
      return;
    }
    setSelectedCardIndex(null);
    setShovelActive(false);
  };

  const shake = rejection?.shake ?? null;
  return {
    selectedCardIndex,
    shovelActive,
    rejectionMessage: rejection?.message ?? null,
    shakeCardIndex: shake?.kind === 'card' ? shake.index : null,
    shovelShaking: shake?.kind === 'shovel',
    onTap,
    onSelectCard,
    onToggleShovel,
  };
}
