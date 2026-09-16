import { Pool, type PoolConfig } from "pg"

type LicenseDatabaseIdentity = "runtime" | "reconciliation"
type Environment = Readonly<Record<string, string | undefined>>

const urlEnvironment: Readonly<Record<LicenseDatabaseIdentity, string>> = {
  runtime: "VECTALON_LICENSE_RUNTIME_DATABASE_URL",
  reconciliation: "VECTALON_LICENSE_RECONCILIATION_DATABASE_URL",
}

let runtimePool: Pool | undefined
let reconciliationPool: Pool | undefined

/** Runtime and reconciliation must use different login credentials, never an owner or generic application URL. */
export function licenseDatabaseUrl(identity: LicenseDatabaseIdentity, environment: Environment = process.env): string {
  const connectionString = environment[urlEnvironment[identity]]
  if (!connectionString) throw new Error("license-database-unavailable")
  const otherIdentity: LicenseDatabaseIdentity = identity === "runtime" ? "reconciliation" : "runtime"
  const otherConnectionString = environment[urlEnvironment[otherIdentity]]
  if (otherConnectionString && (otherConnectionString === connectionString || new URL(otherConnectionString).username === new URL(connectionString).username)) {
    throw new Error("license-database-identities-must-be-distinct")
  }
  return connectionString
}

/** Non-local PostgreSQL must use a supplied CA and certificate verification. */
export function licenseDatabaseOptions(connectionString: string, ca?: string): PoolConfig {
  const hostname = new URL(connectionString).hostname
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  if (!local && !ca) throw new Error("license-database-tls-unconfigured")
  return { connectionString, max: 2, ssl: local ? undefined : { rejectUnauthorized: true, ca } }
}

function poolFor(identity: LicenseDatabaseIdentity): Pool {
  const connectionString = licenseDatabaseUrl(identity)
  const options = licenseDatabaseOptions(connectionString, process.env.VECTALON_LICENSE_DATABASE_SSL_CA)
  if (identity === "runtime") return runtimePool ??= new Pool(options)
  return reconciliationPool ??= new Pool(options)
}

export function lifecycleDatabase(): Pool { return poolFor("runtime") }
export function reconciliationDatabase(): Pool { return poolFor("reconciliation") }
