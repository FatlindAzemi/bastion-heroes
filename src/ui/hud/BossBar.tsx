import type { HudBossView } from './types';

/** Props of the boss health bar (spec 6.3, 9.8). */
export interface BossBarProps {
  readonly boss: HudBossView;
}

/** Clamps a value into the 0..1 range. */
function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Boss health bar (spec 9.8: top center below the card bar, 50 % width): the
 * boss name, current health and the phase markers of spec 6.3. It only renders
 * while a boss is on the field; Morvak's data arrives with M7.
 */
export function BossBar({ boss }: BossBarProps) {
  const healthPercent = Math.round(clampFraction(boss.healthFraction) * 100);
  return (
    <div
      class="hud-boss"
      role="status"
      aria-label={`${boss.name}, ${healthPercent} percent health`}
    >
      <span class="hud-boss__name hud-outlined-text">{boss.name}</span>
      <div class="hud-boss__track">
        <span class="hud-boss__fill" style={{ width: `${healthPercent}%` }} />
        {boss.phaseMarkers.map((marker, index) => (
          <span
            key={index}
            class="hud-boss__phase"
            style={{ left: `${Math.round(clampFraction(marker) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
