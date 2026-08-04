export {
  ECOSYSTEM_CATALOG,
  ECOSYSTEM_ITEMS,
  getEcosystemItem,
  listEcosystemItems,
} from './catalog'
export {
  readEcosystemConfig,
  writeEcosystemConfig,
  enableEcosystemItem,
  disableEcosystemItem,
  exportEcosystemConfig,
  recommendEcosystemSetup,
  applyEcosystemRecommendations,
  detectEcosystemItemsFromDependencies,
  enableEcosystemItems,
} from './config'
export {
  readSkillContent,
  readEnabledSkills,
  formatSkillsContext,
  buildSkillsSystemPrompt,
} from './skills'
export type { SkillSource, SkillsContextOptions } from './skills'
export {
  checkEcosystemItem,
  runEcosystemDoctor,
  checkNativeToolchain,
  checkLeaderboardReadiness,
  runDoctor,
  fixForMissing,
  runDoctorFixes,
  TOOLCHAIN_ITEM_IDS,
  LEADERBOARD_ITEM_IDS,
} from './doctor'
export type {
  DoctorStatus,
  DoctorCheckResult,
  DoctorReport,
  DoctorCheckers,
  DoctorCategory,
  ToolchainItemId,
  LeaderboardItemId,
  ToolchainCheckOptions,
  LeaderboardCheckOptions,
  DoctorFix,
  FixAttempt,
  DoctorFixer,
} from './doctor'
export type { EcosystemConfig, EcosystemExport } from './config'
export type {
  EcosystemCategory,
  EcosystemItem,
  EcosystemCatalog,
  ProjectFlavor,
} from './types'
