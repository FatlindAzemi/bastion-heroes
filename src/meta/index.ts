/**
 * Public API of the meta layer (spec 11.2): save, progression, rewards, card
 * upgrades, chests, daily quests and settings. UI and main import from here.
 */
export {
  BROKEN_SAVE_PREFIX,
  SAVE_KEY,
  SAVE_VERSION,
  addChest,
  chestCount,
  cloneSave,
  createDefaultSave,
  levelLoadout,
  loadSave,
  markTutorialSeen,
  migrateSave,
  ownedCardCount,
  ownsCard,
  persistSave,
  resetSave,
  setLevelLoadout,
  updateSettings,
  type CardSave,
  type SaveData,
  type Settings,
} from './save';
export { applyLevelResult, type LevelRewardSummary } from './rewards';
export { cardUpgradeView, upgradeCard, type CardUpgradeView, type UpgradeResult } from './upgrades';
export {
  buyChest,
  openChest,
  type ChestOpenResult,
  type ChestOpenStack,
  type ChestPurchaseResult,
} from './chests';
export {
  applyRunToQuests,
  completedQuestCount,
  createDailyQuests,
  ensureDailyQuests,
  type DailyQuests,
  type QuestReward,
  type QuestRunSummary,
} from './quests';
export {
  clearedLevelCount,
  firstLevelId,
  isLevelUnlocked,
  nextLevelId,
  nextLevelToPlay,
  starsForLevel,
  totalStars,
} from './progress';
export { applySettings, sanitizeSettings } from './settings';
export { localDateKey, todayKey } from './date';
