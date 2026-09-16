import { Pool, type PoolConfig } from "pg"
import { licenseDatabaseOptions } from "../licenses/database"

let pool: Pool | undefined

/** Operator storage never falls back to the website owner or license runtime. */
export function operatorDatabaseOptions(environment: Readonly<Record<string, string | undefined>> = process.env): PoolConfig {
  try {
    const connectionString = environment.VECTALON_OPERATOR_DATABASE_URL
    if (!connectionString) throw new Error()
    const url = new URL(connectionString)
    if (!["postgres:", "postgresql:"].includes(url.protocol)
      || !/^vectalon_operator_runtime(?:\.[a-z0-9]{20})?$/.test(decodeURIComponent(url.username))
      || !url.password || !url.hostname || url.search || url.hash) throw new Error()
    return licenseDatabaseOptions(connectionString, environment.VECTALON_OPERATOR_DATABASE_SSL_CA)
  } catch { throw new Error("operator-database-unavailable") }
}

export function operatorDatabase(): Pool { return pool ??= new Pool(operatorDatabaseOptions()) }
