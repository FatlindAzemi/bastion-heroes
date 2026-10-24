import type { HudBannerKind, HudBannerView } from './types';

/** Props of the full-width wave banner (spec 3.10, 9.8). */
export interface WaveBannerProps {
  readonly banner: HudBannerView | null;
}

/** Banner texts of spec 3.10. */
const BANNER_TITLES: Readonly<Record<HudBannerKind, string>> = {
  big: 'A huge wave is coming!',
  final: 'FINAL WAVE',
};

/**
 * Wave banner (spec 9.8: center, full width, 120 px): "A huge wave is coming!"
 * for BIG waves 3 s before they spawn and "FINAL WAVE" at the final wave. The
 * mount/unmount plus the `nonce` restart the slide-in/out animation.
 */
export function WaveBanner({ banner }: WaveBannerProps) {
  if (banner === null) {
    return null;
  }
  return (
    <div
      key={banner.nonce}
      class={`hud-banner hud-banner--${banner.kind}`}
      role="status"
      aria-live="polite"
    >
      <span class="hud-banner__text hud-outlined-text">{BANNER_TITLES[banner.kind]}</span>
    </div>
  );
}
