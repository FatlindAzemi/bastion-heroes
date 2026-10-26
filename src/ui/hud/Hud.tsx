import { BossBar } from './BossBar';
import { CardBar } from './CardBar';
import { EssenceCounter } from './EssenceCounter';
import { LevelProgress } from './LevelProgress';
import { PausedOverlay } from './PausedOverlay';
import { RejectionMessage } from './RejectionMessage';
import { SpeedPauseControls } from './SpeedPauseControls';
import { TipBubble } from './TipBubble';
import { WaveBanner } from './WaveBanner';
import type { HudBus, HudOptions } from './types';
import { useAnimationRedraw, useInteraction } from './useInteraction';

/** Props of the mounted HUD: the view adapter, actions and the event bus. */
export interface HudProps extends HudOptions {
  readonly bus: HudBus;
}

/**
 * Portrait in-level HUD of spec 9.8 / issue #113: a floating top status bar
 * (Essence pill, compact level progress, round speed and pause controls), the boss
 * bar below it, the wave banner across the middle, the rejection toast just above
 * the bottom card tray (6 cards + shovel in thumb reach) and the pause overlay.
 * It only reads the sim through `readState` and sends intents through `actions`
 * (spec 11.3, 11.8).
 */
export function Hud({ bus, readState, actions, pointerToWorld, initialBanner, tip }: HudProps) {
  useAnimationRedraw();
  const interaction = useInteraction({ bus, readState, actions, pointerToWorld, initialBanner });
  const view = readState();
  return (
    <div class="hud">
      <div class="hud__tap-layer" onPointerUp={interaction.onTap} />
      <div class="hud-top">
        <EssenceCounter essence={view.essence} />
        <LevelProgress progress={view.progress} />
        <SpeedPauseControls
          speed={view.speed}
          paused={view.paused}
          onToggleSpeed={actions.toggleSpeed}
          onTogglePause={actions.togglePause}
        />
      </div>
      {tip === undefined ? null : <TipBubble tip={tip} />}
      {view.boss === null ? null : <BossBar boss={view.boss} />}
      <WaveBanner banner={interaction.banner} />
      <div class="hud-tray">
        <RejectionMessage message={interaction.rejectionMessage} />
        <CardBar
          cards={view.cards}
          selectedIndex={interaction.selectedCardIndex}
          shakeCardIndex={interaction.shakeCardIndex}
          shovelActive={interaction.shovelActive}
          shovelShaking={interaction.shovelShaking}
          onSelectCard={interaction.onSelectCard}
          onToggleShovel={interaction.onToggleShovel}
        />
      </div>
      {view.paused ? (
        <PausedOverlay
          onResume={actions.togglePause}
          onRestart={actions.onRestart}
          onQuit={actions.onQuit}
        />
      ) : null}
    </div>
  );
}
