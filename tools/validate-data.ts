/**
 * `npm run validate-data` (spec 10.3): parses every definition in the data
 * registry with its Zod schema (spec 11.5) and prints one summary line. It
 * throws on the first invalid definition or duplicate id, so `tsx` exits
 * non-zero and CI fails (spec 13.7).
 *
 * The script uses no Node globals on purpose: `@types/node` is not in the
 * approved package list (spec 10.2), so an uncaught throw is what makes the
 * process exit non-zero. `console` comes from the DOM lib of tsconfig.
 */
import { defenders, enemies, levels, rules } from '../src/data';
import { DefenderDef, EnemyDef, LevelDef, RulesDef } from '../src/data/schemas';

/** Parses every definition of one kind; throws on the first duplicate id. */
function parseAndCount<T extends { id: string }>(
  kind: string,
  defs: readonly T[],
  parse: (def: T) => unknown,
): number {
  const ids = new Set<string>();
  for (const def of defs) {
    parse(def);
    if (ids.has(def.id)) {
      throw new Error(`validate-data: duplicate ${kind} id "${def.id}"`);
    }
    ids.add(def.id);
  }
  return defs.length;
}

/** Formats "1 enemy" / "2 enemies" for the summary line. */
function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

const defenderCount = parseAndCount('defender', defenders, (def) => DefenderDef.parse(def));
const enemyCount = parseAndCount('enemy', enemies, (def) => EnemyDef.parse(def));
const levelCount = parseAndCount('level', levels, (def) => LevelDef.parse(def));
RulesDef.parse(rules);

console.log(
  'validate-data: ok - ' +
    `${formatCount(defenderCount, 'defender', 'defenders')}, ` +
    `${formatCount(enemyCount, 'enemy', 'enemies')}, ` +
    `${formatCount(levelCount, 'level', 'levels')}, rules parsed`,
);
