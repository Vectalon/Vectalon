import { OPERATOR_ROLES } from "./access"
type Queryable = { query(sql: string, values: unknown[]): Promise<{ rows: { result: unknown }[] }> }
type Input = { tokenHash: string; csrfHash: string; subject: string; githubLogin: string; role: string; active: boolean; reason: string }
export async function changeStoredOperatorMembership(database: Queryable, input: Input): Promise<{ ok: true } | { ok: false; code: string }> {
  if (!/^[a-f0-9]{64}$/.test(input.tokenHash) || !/^[a-f0-9]{64}$/.test(input.csrfHash)
    || !/^[1-9][0-9]{0,19}$/.test(input.subject) || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(input.githubLogin)
    || !Object.hasOwn(OPERATOR_ROLES, input.role) || typeof input.active !== "boolean" || typeof input.reason !== "string"
    || input.reason.trim().length < 3 || input.reason.length > 500) return { ok: false, code: "invalid-membership" }
  try {
    const query = await database.query("select vectalon_private.operator_change_membership($1,$2,$3,$4,$5,$6,$7) as result", [input.tokenHash,input.csrfHash,input.subject,input.githubLogin,input.role,input.active,input.reason.trim()])
    const result = query.rows[0]?.result as { ok?: unknown; code?: unknown } | undefined
    if (result?.ok === true) return { ok: true }
    const codes = ["unauthorized","forbidden","csrf-invalid","reauth-required","reason-required","invalid-membership","last-platform-admin"]
    return { ok: false, code: result?.ok === false && typeof result.code === "string" && codes.includes(result.code) ? result.code : "service-unavailable" }
  } catch { return { ok: false, code: "service-unavailable" } }
}
