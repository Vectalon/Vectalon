/**
 * Vectalon RN — Ecosystem catalog and doctor
 * Business Source License 1.1 (BSL-1.1)
 */

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
  detectProjectFlavor,
} from './config'
export {
  readSkillContent,
  readEnabledSkills,
  formatSkillsContext,
  formatSkillsPreview,
  buildSkillsSystemPrompt,
  enrichWithSkills,
} from './skills'
export type { SkillSource, SkillsContextOptions, SkillsPreviewOptions } from './skills'
export {
  checkEcosystemItem,
  runEcosystemDoctor,
  checkNativeToolchain,
  checkLeaderboardReadiness,
  checkModelAccess,
  runDoctor,
  fixForMissing,
  runDoctorFixes,
  defensiveCheckers,
  probeFailuresOf,
  runDoctorSelfTest,
  TOOLCHAIN_ITEM_IDS,
  LEADERBOARD_ITEM_IDS,
  MODEL_ACCESS_ITEM_IDS,
} from './doctor'
export type {
  DoctorStatus,
  DoctorCheckResult,
  DoctorReport,
  DoctorCheckers,
  DoctorCategory,
  ToolchainItemId,
  LeaderboardItemId,
  ModelAccessItemId,
  ToolchainCheckOptions,
  LeaderboardCheckOptions,
  ModelAccessCheckOptions,
  DoctorFix,
  FixAttempt,
  DoctorFixer,
  ProbeFailure,
  DoctorSelfTestResult,
} from './doctor'
export type { EcosystemConfig, EcosystemExport } from './config'
export type {
  EcosystemCategory,
  EcosystemItem,
  EcosystemCatalog,
  ProjectFlavor,
} from './types'
