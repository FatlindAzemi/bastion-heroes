/**
 * Hand-written SVG icon set (spec 12.11, issue #76): 2 px #1B1B2F outlines with the
 * 9.4 palette colours, loaded from `public/icons/` so the HUD never uses emoji.
 */

/** Every icon file under `public/icons/`. */
export type IconName =
  | 'essence'
  | 'shovel'
  | 'pause'
  | 'play'
  | 'speed'
  | 'flag'
  | 'skull'
  | 'star'
  | 'chest'
  | 'settings';

/** File name of each icon (the `essence-orb` file is the Essence currency icon). */
const ICON_FILES: Readonly<Record<IconName, string>> = {
  essence: 'essence-orb',
  shovel: 'shovel',
  pause: 'pause',
  play: 'play',
  speed: 'speed',
  flag: 'flag',
  skull: 'skull',
  star: 'star',
  chest: 'chest',
  settings: 'settings',
};

/** Props of one HUD/UI icon. */
export interface IconProps {
  readonly name: IconName;
  /** Extra class for sizing and positioning; every icon is decorative by default. */
  readonly class?: string;
}

/** Renders a bundled SVG icon; decorative (the surrounding control carries the label). */
export function Icon({ name, class: className }: IconProps) {
  const classNames = className === undefined ? 'ui-icon' : `ui-icon ${className}`;
  return (
    <img
      class={classNames}
      src={`/icons/${ICON_FILES[name]}.svg`}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
