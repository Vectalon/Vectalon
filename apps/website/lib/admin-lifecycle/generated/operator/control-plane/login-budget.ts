type Queryable = { query(sql:string,values:unknown[]):Promise<{ rows:{ attempts:number; retry_after:number }[] }> }
export async function consumeOperatorLoginBudget(database:Queryable,hash:string,mode:"start"|"poll"):Promise<{ allowed:boolean; retryAfterSeconds:number }> {
  try {
    if (!/^[a-f0-9]{64}$/.test(hash) || !["start","poll"].includes(mode)) throw new Error()
    const result = await database.query(`insert into vectalon_private.operator_login_budgets(budget_key,window_started_at,attempts,expires_at)
      values ($1,clock_timestamp(),1,clock_timestamp()+interval '30 minutes')
      on conflict (budget_key) do update set
        attempts = case when operator_login_budgets.window_started_at <= clock_timestamp()-interval '15 minutes' then 1 else least(operator_login_budgets.attempts+1,1000) end,
        window_started_at = case when operator_login_budgets.window_started_at <= clock_timestamp()-interval '15 minutes' then clock_timestamp() else operator_login_budgets.window_started_at end,
        expires_at = clock_timestamp()+interval '30 minutes'
      returning attempts,greatest(1,ceil(extract(epoch from window_started_at+interval '15 minutes'-clock_timestamp())))::integer as retry_after`,[`${mode}:${hash}`])
    const row = result.rows[0]
    if (!row || !Number.isSafeInteger(row.attempts) || row.attempts < 1 || row.attempts > 1000 || !Number.isSafeInteger(row.retry_after) || row.retry_after < 1 || row.retry_after > 900) throw new Error()
    return { allowed:row.attempts <= (mode === "start" ? 10 : 200),retryAfterSeconds:row.retry_after }
  } catch { throw new Error("operator-budget-unavailable") }
}
