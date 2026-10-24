import type { EnemyDef } from '../schemas';

/**
 * Bat Swarm (spec 6.1, 6.2). Flies at height 1.5 over every ground defender and
 * wall, never attacks, and only the Last Stand Trap (which does hit flying
 * enemies) can stop it. The 6.1 table has no attack damage or interval ("—").
 */
export const batSwarm: EnemyDef = {
  id: 'bat_swarm',
  name: 'Bat Swarm',
  hp: 120,
  armor: 'light',
  speed: 0.1,
  biteDamage: 0,
  isFlying: true,
  isBoss: false,
  milestone: 'M2',
};
