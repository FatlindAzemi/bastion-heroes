import { CardPortrait } from '../components/CardPortrait';
import { Icon } from '../components/Icon';
import { useAnimationRedraw } from '../hud/useInteraction';
import { RejectionMessage } from '../hud/RejectionMessage';
import { duelCardView } from './duelCards';
import { DuelHand } from './DuelHand';
import { EssenceBar } from './EssenceBar';
import { GatePips } from './GatePips';
import { MatchTimer } from './MatchTimer';
import { OpponentBar } from './OpponentBar';
import { PhaseOverlay } from './PhaseOverlay';
import { SurrenderMenu } from './SurrenderMenu';
import type { DuelHudBus, DuelHudOptions } from './types';
import { useDuelInteraction, type DuelInteraction } from './useDuelInteraction';

/** Props of the mounted Duel HUD: view adapter, actions and the event bus. */
export interface DuelHudProps extends DuelHudOptions {
  readonly bus: DuelHudBus;
}

/** The ghost card under the finger while a card is dragged (spec 18.5). */
function DragGhostView({ interaction }: { readonly interaction: DuelInteraction }) {
  const ghost = interaction.ghost;
  const card = ghost === null ? null : duelCardView(ghost.cardId);
  if (ghost === null || card === null) {
    return null;
  }
  return (
    <span
      class={`duel-ghost duel-ghost--${card.kind}`}
      style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)` }}
      aria-hidden="true"
    >
      <CardPortrait
        defenderId={card.cardId}
        faction={card.faction}
        rarity={card.rarity}
        class="duel-ghost__portrait"
      />
    </span>
  );
}

/**
 * Portrait Duel HUD of spec 18.9: the opponent bar and the match timer at the top,
 * the surrender menu top right, and above the hand the own gate pips and the
 * 10-segment Essence bar; at the bottom the "next" card and the 4 hand cards. It
 * reads the match only through `readState` and sends intents through `actions`.
 */
export function DuelHud(props: DuelHudProps) {
  useAnimationRedraw();
  const interaction = useDuelInteraction(props);
  const view = props.readState();
  return (
    <div class={`hud duel-hud${interaction.heldSlot === null ? '' : ' duel-hud--holding'}`}>
      <div class="hud__tap-layer" data-testid="duel-board" onPointerUp={interaction.onBoardTap} />
      <div class="duel-top">
        <OpponentBar opponent={view.opponent} gate={view.opponentGate} maxGate={view.maxGate} />
        <SurrenderMenu disabled={view.ended} onSurrender={props.actions.surrender} />
      </div>
      <MatchTimer seconds={view.clockSeconds} phase={view.phase} />
      <PhaseOverlay
        countdownSeconds={view.countdownSeconds}
        showFight={interaction.showFight}
        banner={interaction.banner}
      />
      <div class="duel-tray">
        <RejectionMessage message={interaction.rejection?.message ?? null} />
        <div class="duel-tray__status">
          <Icon name="shield" class="duel-tray__gate-icon" />
          <GatePips health={view.ownGate} max={view.maxGate} side="own" label="Your gate" />
        </div>
        <EssenceBar essence={view.essence} max={view.maxEssence} progress={view.essenceProgress} />
        <DuelHand
          hand={view.hand}
          next={view.next}
          essence={view.essence}
          interaction={interaction}
        />
      </div>
      <DragGhostView interaction={interaction} />
    </div>
  );
}
