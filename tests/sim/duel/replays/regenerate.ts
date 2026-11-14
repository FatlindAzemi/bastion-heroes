/**
 * Regenerates the committed golden Duel replays (spec 11.6, 16.7).
 *
 * Run from the repository root:
 *   npx tsx tests/sim/duel/replays/regenerate.ts | \
 *     awk '/^=== /{file=$2; next} file{print > ("tests/sim/duel/replays/" file)}'
 *   npx prettier --write tests/sim/duel/replays
 *
 * The command prints one JSON block per golden file, separated by
 * `=== <file name> ===` markers. Regenerate only in the pull request that changes
 * the Duel rules or data, and state the reason in the PR description (spec 11.6).
 * This file never writes files itself (no Node types in the project) and the
 * determinism test never runs it: the golden JSON files are the source of truth.
 */
import { hashDuelState } from '../../../../src/sim/duel';
import { runDuelReplay } from '../../../../src/sim/duelMatch';
import { DUEL_SCENARIOS, recordScenario, type GoldenDuelReplay } from './scenarios';

for (const scenario of DUEL_SCENARIOS) {
  const recorded = recordScenario(scenario);
  const replay = recorded.replay();
  const expected = runDuelReplay(replay);
  const live = recorded.match.state;
  if (expected.finalTick !== live.tick || expected.hashes.at(-1)?.hash !== hashDuelState(live)) {
    throw new Error(`${scenario.fileName}: the live run and the replayed run differ`);
  }
  const golden: GoldenDuelReplay = { description: scenario.description, ...replay, expected };
  console.log(`=== ${scenario.fileName} ===`);
  console.log(JSON.stringify(golden, null, 2));
}
