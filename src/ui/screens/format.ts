/** Compact number and star labels shared by the title, level select and meta screens. */

/** Formats 950 as "950", 1200 as "1.2K" and 2_000_000 as "2M". */
export function formatAmount(value: number): string {
  const safe = Math.max(0, Math.floor(value));
  if (safe >= 1_000_000) {
    const millions = safe / 1_000_000;
    return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (safe >= 1_000) {
    const thousands = safe / 1_000;
    return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(safe);
}

/** "★ 12 / 30" style label used by the level select progress pill. */
export function starProgressLabel(stars: number, total: number): string {
  return `${stars} / ${total} stars`;
}
