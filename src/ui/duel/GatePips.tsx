/** Props of a row of gate health pips (spec 18.7, 18.9). */
export interface GatePipsProps {
  readonly health: number;
  readonly max: number;
  /** Own gate pips are teal, the opponent's red (spec 18.1 side colours). */
  readonly side: 'own' | 'enemy';
  readonly label: string;
}

/** One pip per gate health point; a lost point breaks with a short pop. */
export function GatePips({ health, max, side, label }: GatePipsProps) {
  return (
    <div
      class={`duel-pips duel-pips--${side}`}
      role="img"
      aria-label={`${label} ${health} of ${max}`}
      data-testid={`duel-gate-${side}`}
      data-health={health}
    >
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          class={`duel-pip${index < health ? '' : ' duel-pip--empty'}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
