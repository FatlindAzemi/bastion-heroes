import { Icon, type IconName } from './Icon';
import { formatAmount } from '../screens/format';

/** The three wallet currencies the shell screens show (spec 8.1). */
export type CurrencyKind = 'gold' | 'gems' | 'stars';

/** Icon and tone of each currency pill. */
const CURRENCY_ICONS: Readonly<Record<CurrencyKind, IconName>> = {
  gold: 'goldCoin',
  gems: 'gem',
  stars: 'star',
};

/** Props of one compact wallet pill. */
export interface CurrencyPillProps {
  readonly kind: CurrencyKind;
  readonly value: number;
  /** Optional total for star progress, e.g. "12 / 30 stars". */
  readonly total?: number;
  readonly label?: string;
  readonly testId?: string;
}

/** Frosted wallet pill with the currency icon and a compact amount (spec 8.1, 9.8). */
export function CurrencyPill({ kind, value, total, label, testId }: CurrencyPillProps) {
  const text =
    total === undefined ? formatAmount(value) : `${formatAmount(value)} / ${formatAmount(total)}`;
  const aria =
    label ?? (kind === 'stars' ? `${text} stars` : `${text} ${kind === 'gold' ? 'gold' : 'gems'}`);
  return (
    <span class={`currency-pill currency-pill--${kind}`} aria-label={aria} data-testid={testId}>
      <Icon name={CURRENCY_ICONS[kind]} class="currency-pill__icon" />
      <span class="currency-pill__value">{text}</span>
    </span>
  );
}
