import { BossBar } from './BossBar';
import { CardBar } from './CardBar';
import { EssenceCounter } from './EssenceCounter';
import { LevelProgress } from './LevelProgress';
import { PausedOverlay } from './PausedOverlay';
import { RejectionMessage } from './RejectionMessage';
import { SpeedPauseControls } from './SpeedPauseControls';
import { WaveBanner } from './WaveBanner';
import type { HudBus, HudOptions } from './types';
import { useAnimationRedraw, useInteraction } from './useInteraction';

/** Props of the mounted HUD: the view adapter, actions and the event bus. */
export interface HudProps extends HudOptions {
  readonly bus: HudBus;
}

/**
 * Final in-level HUD of spec 9.8: Essence counter, card bar with the shovel, speed and
 * pause controls, level progress, wave banner, boss bar, a full-field tap layer and the
 * rejected-command feedback. It only reads the sim through `readState` and sends intents
 * through `actions` (spec 11.3, 11.8).
 */
export function Hud({ bus, readState, actions, pointerToWorld, initialBanner }: HudProps) {
  useAnimationRedraw();
  const interaction = useInteraction({ bus, readState, actions, pointerToWorld, initialBanner });
  const view = readState();
  return (
    <div class="hud">
      <div class="hud__tap-layer" onPointerUp={interaction.onTap} />
      <EssenceCounter essence={view.essence} />
      <CardBar
        cards={view.cards}
        selectedIndex={interaction.selectedCardIndex}
        shakeCardIndex={interaction.shakeCardIndex}
        shovelActive={interaction.shovelActive}
        shovelShaking={interaction.shovelShaking}
        onSelectCard={interaction.onSelectCard}
        onToggleShovel={interaction.onToggleShovel}
      />
      <SpeedPauseControls
        speed={view.speed}
        paused={view.paused}
        onToggleSpeed={actions.toggleSpeed}
        onTogglePause={actions.togglePause}
      />
      <LevelProgress progress={view.progress} />
      {view.boss === null ? null : <BossBar boss={view.boss} />}
      <WaveBanner banner={interaction.banner} />
      <RejectionMessage message={interaction.rejectionMessage} />
      {view.paused ? <PausedOverlay onResume={actions.togglePause} /> : null}
    </div>
  );
}
