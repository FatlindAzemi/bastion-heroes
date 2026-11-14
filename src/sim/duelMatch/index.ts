/**
 * The Duel match layer around the Duel sim (spec 18.4, 18.10, 19.3): deck rules,
 * the private hand cycle and the local match host for Training. It is not part
 * of the sim state; the match server (D3) reuses the deck and hand code.
 */
export {
  duelCardKind,
  isValidDuelDeck,
  validateDuelDeck,
  type DuelCardKind,
  type DuelDeckProblem,
} from './deck';
export {
  createDuelHand,
  cyclePlayedCard,
  handViewOf,
  isInHand,
  type DuelHandState,
  type DuelHandView,
} from './hand';
export {
  createLocalDuelMatch,
  type DuelCardPlay,
  type DuelPlayerSetup,
  type DuelPlayRejectReason,
  type LocalDuelMatch,
  type LocalDuelMatchOptions,
} from './localMatch';
