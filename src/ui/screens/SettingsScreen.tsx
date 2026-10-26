import { useState } from 'preact/hooks';

import { ownedCardCount, totalStars, type SaveData, type Settings } from '../../meta';
import { playSfx } from '../../platform/audio';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

/** Props of the M4 settings screen (spec 4.8, 9.8). */
export interface SettingsScreenProps {
  readonly save: SaveData;
  /** Returns to the screen the settings were opened from. */
  readonly onBack: () => void;
  /** Applies and persists one setting change. */
  readonly onSettings: (patch: Partial<Settings>) => void;
  /** Deletes the save and returns to a fresh new-player state. */
  readonly onReset: () => void;
}

/** One volume slider row. */
function VolumeRow({
  label,
  icon,
  value,
  testId,
  onChange,
}: {
  readonly label: string;
  readonly icon: 'soundOn' | 'soundOff';
  readonly value: number;
  readonly testId: string;
  readonly onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <label class="settings-row">
      <span class="settings-row__icon-wrap" aria-hidden="true">
        <Icon name={icon} class="settings-row__icon" />
      </span>
      <span class="settings-row__text">
        <span class="settings-row__label">{label}</span>
        <span class="settings-row__hint">Drag to change</span>
      </span>
      <span class="settings-row__control settings-row__control--slider">
        <input
          class="settings-slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          aria-label={label}
          data-testid={testId}
          onInput={(event): void => onChange(Number(event.currentTarget.value) / 100)}
        />
        <span class="settings-slider__value" aria-hidden="true">
          {percent}%
        </span>
      </span>
    </label>
  );
}

/** One on/off toggle row. */
function ToggleRow({
  label,
  hint,
  icon,
  checked,
  testId,
  onChange,
}: {
  readonly label: string;
  readonly hint: string;
  readonly icon: 'timer' | 'vibrate';
  readonly checked: boolean;
  readonly testId: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <div class="settings-row">
      <span class="settings-row__icon-wrap" aria-hidden="true">
        <Icon name={icon} class="settings-row__icon" />
      </span>
      <span class="settings-row__text">
        <span class="settings-row__label">{label}</span>
        <span class="settings-row__hint">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        class={`settings-toggle${checked ? ' settings-toggle--on' : ''}`}
        data-testid={testId}
        onClick={(): void => {
          playSfx('button_tap');
          onChange(!checked);
        }}
      >
        <span class="settings-toggle__track" aria-hidden="true">
          <span class="settings-toggle__thumb" />
        </span>
        <span class="settings-toggle__state" aria-hidden="true">
          {checked ? 'On' : 'Off'}
        </span>
      </button>
    </div>
  );
}

/**
 * M4 settings screen (spec 4.8): music and SFX volume sliders, auto-collect and
 * haptics toggles, the shipped language and the destructive reset with a confirm
 * dialog. Every change goes straight to the save and the platform wrappers.
 */
export function SettingsScreen({ save, onBack, onSettings, onReset }: SettingsScreenProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <main class="screen settings-screen" data-testid="settings-screen">
      <div class="screen__inner">
        <ScreenHeader
          eyebrow="The Bastion command tent"
          title="Settings"
          onBack={onBack}
          backTestId="settings-back"
        />
        <div class="screen__body settings-body">
          <section class="settings-panel glass-panel" aria-label="Audio">
            <h2 class="screen__section-title">Audio</h2>
            <VolumeRow
              label="Music"
              icon="soundOn"
              value={save.settings.music}
              testId="setting-music"
              onChange={(value): void => onSettings({ music: value })}
            />
            <VolumeRow
              label="Sound effects"
              icon="soundOn"
              value={save.settings.sfx}
              testId="setting-sfx"
              onChange={(value): void => onSettings({ sfx: value })}
            />
          </section>
          <section class="settings-panel glass-panel" aria-label="Gameplay">
            <h2 class="screen__section-title">Gameplay</h2>
            <ToggleRow
              label="Auto-collect orbs"
              hint="Pick up Essence drops automatically"
              icon="timer"
              checked={save.settings.autoCollect}
              testId="setting-autocollect"
              onChange={(checked): void => onSettings({ autoCollect: checked })}
            />
            <ToggleRow
              label="Haptics"
              hint="Vibration feedback in battle"
              icon="vibrate"
              checked={save.settings.haptics}
              testId="setting-haptics"
              onChange={(checked): void => onSettings({ haptics: checked })}
            />
            <div class="settings-row settings-row--static">
              <span class="settings-row__icon-wrap" aria-hidden="true">
                <Icon name="flag" class="settings-row__icon" />
              </span>
              <span class="settings-row__text">
                <span class="settings-row__label">Language</span>
                <span class="settings-row__hint">English is the shipped language</span>
              </span>
              <span class="settings-language" data-testid="setting-language">
                English
              </span>
            </div>
          </section>
          <section class="settings-panel glass-panel" aria-label="Progress">
            <h2 class="screen__section-title">Progress</h2>
            <div class="settings-stats">
              <span class="settings-stat">
                <span class="settings-stat__value">{save.stats.levelsWon}</span>
                <span class="settings-stat__label">levels won</span>
              </span>
              <span class="settings-stat">
                <span class="settings-stat__value">{totalStars(save)}</span>
                <span class="settings-stat__label">stars</span>
              </span>
              <span class="settings-stat">
                <span class="settings-stat__value">{ownedCardCount(save)}</span>
                <span class="settings-stat__label">cards</span>
              </span>
              <span class="settings-stat">
                <span class="settings-stat__value">{save.stats.enemiesDefeated}</span>
                <span class="settings-stat__label">enemies</span>
              </span>
            </div>
          </section>
          <section class="settings-danger" aria-label="Reset progress">
            <div>
              <p class="settings-danger__title">Reset progress</p>
              <p class="settings-danger__hint">
                Deletes cards, stars, gold and quest progress. This cannot be undone.
              </p>
            </div>
            <Button
              variant="danger"
              onClick={(): void => setConfirmReset(true)}
              testId="setting-reset"
            >
              Reset
            </Button>
          </section>
        </div>
      </div>
      {confirmReset ? (
        <div
          class="settings-confirm-overlay"
          data-testid="settings-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-label="Reset progress?"
        >
          <div class="settings-confirm glass-panel">
            <span class="settings-confirm__icon" aria-hidden="true">
              <Icon name="skull" class="settings-confirm__icon-image" />
            </span>
            <h2 class="settings-confirm__title">Start over?</h2>
            <p class="settings-confirm__text">
              Every card, star and coin will be removed. Your chests and daily quests reset too.
            </p>
            <div class="settings-confirm__actions">
              <Button
                variant="secondary"
                onClick={(): void => setConfirmReset(false)}
                testId="setting-reset-cancel"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={(): void => {
                  playSfx('button_tap');
                  setConfirmReset(false);
                  onReset();
                }}
                testId="setting-reset-confirm"
              >
                Reset everything
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
