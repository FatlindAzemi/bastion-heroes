import type { DuelBannerView } from './useDuelFeedback';

/** Props of the centre overlays: countdown, "Fight!" and the phase banner (spec 18.2). */
export interface PhaseOverlayProps {
  readonly countdownSeconds: number;
  readonly showFight: boolean;
  readonly banner: DuelBannerView | null;
}

/** Banner texts of spec 18.2 ("OVERDRIVE") and the sudden-death start. */
const BANNER_TEXT: Readonly<Record<DuelBannerView['phase'], string>> = {
  overdrive: 'OVERDRIVE',
  suddenDeath: 'SUDDEN DEATH',
};

/** The 3 s countdown number, "Fight!" when it ends, and the sliding phase banner. */
export function PhaseOverlay({ countdownSeconds, showFight, banner }: PhaseOverlayProps) {
  return (
    <>
      {countdownSeconds > 0 ? (
        <div class="duel-countdown" data-testid="duel-countdown" role="status">
          <span key={countdownSeconds} class="duel-countdown__number">
            {countdownSeconds}
          </span>
        </div>
      ) : null}
      {showFight ? (
        <div class="duel-countdown duel-countdown--fight" role="status">
          <span class="duel-countdown__number">Fight!</span>
        </div>
      ) : null}
      {banner === null ? null : (
        <div
          key={banner.nonce}
          class={`hud-banner duel-banner duel-banner--${banner.phase}`}
          role="status"
          data-testid="duel-banner"
        >
          <span class="hud-banner__text">{BANNER_TEXT[banner.phase]}</span>
        </div>
      )}
    </>
  );
}
