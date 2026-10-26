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
  | 'starEmpty'
  | 'chest'
  | 'settings'
  | 'arrowBack'
  | 'restart'
  | 'levels'
  | 'crest'
  | 'map'
  | 'cards'
  | 'soundOn'
  | 'soundOff'
  | 'gem'
  | 'coin'
  | 'goldCoin'
  | 'close'
  | 'lock'
  | 'check'
  | 'timer'
  | 'shield'
  | 'home'
  | 'vibrate'
  | 'plus'
  | 'minus'
  | 'backArrow';

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
  starEmpty: 'star-empty',
  chest: 'chest',
  settings: 'settings',
  arrowBack: 'arrow-back',
  restart: 'restart',
  levels: 'levels',
  crest: 'bastion-crest',
  map: 'map',
  cards: 'cards',
  soundOn: 'sound-on',
  soundOff: 'sound-off',
  gem: 'gem',
  coin: 'coin',
  goldCoin: 'gold-coin',
  close: 'close',
  lock: 'lock',
  check: 'check',
  timer: 'timer',
  shield: 'shield',
  home: 'home',
  vibrate: 'vibrate',
  plus: 'plus',
  minus: 'minus',
  backArrow: 'back-arrow',
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
