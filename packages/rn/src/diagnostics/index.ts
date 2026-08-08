/**
 * Diagnostics & error telemetry (P0) — barrel
 * Business Source License 1.1 (BSL-1.1)
 */
export * from './types'
export {
  DEFAULT_TELEMETRY_BASE_URL,
  TELEMETRY_BASE_URL,
  ERROR_ENDPOINT,
  HEARTBEAT_ENDPOINT,
  SUPPORT_ENDPOINT,
  SUPPORT_RECIPIENT,
  MAX_QUEUED_ERRORS,
  errorsEnabled,
  setErrorsEnabled,
  commandContext,
  queuePathFor,
  readErrorQueue,
  writeErrorQueue,
  captureError,
  reportErrorTelemetry,
  flushErrorQueue,
} from './errorReporter'
export type { CaptureErrorOptions, FlushErrorQueueOptions } from './errorReporter'
export {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  detectProjectType,
  buildHeartbeatPayload,
  sendHeartbeat,
  startHeartbeat,
} from './heartbeat'
export type { HeartbeatOptions, HeartbeatHandle } from './heartbeat'
export {
  aggregateHealth,
  collectHealthReport,
} from './health'
export type { HealthCheckInputs } from './health'
export {
  listVectalonState,
  detectProjectTypeFromPkg,
  collectDiagnosticsBundle,
  writeDiagnosticsBundle,
} from './bundle'
export type { CollectDiagnosticsOptions } from './bundle'
export {
  sanitize,
  readSanitizedPackageJson,
  generateSupportToken,
  buildSupportBundle,
  uploadSupportBundle,
  tokenForRoot,
  writeSupportBundle,
} from './support'
export type { SupportBundleOptions, UploadSupportBundleOptions } from './support'
