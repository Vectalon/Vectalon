import { consumeTrialPollBudget } from '../lib/trial-rate-limit'

test('hashes device codes and blocks excessive polling without storing the credential', async () => {
  const query = jest.fn(async (_sql: string, _values: unknown[]) => ({ rows: [{ attempts: 31, window_started_at: new Date(1_800_000_000_000) }] }))
  const deviceCode = 'sensitive-device-code-1234567890'
  await expect(consumeTrialPollBudget(deviceCode, 1_800_000_010_000, { query })).resolves.toEqual({ allowed: false, retryAfterSeconds: 60 })
  const [sql, values] = query.mock.calls[0]!
  expect(sql).toContain('ON CONFLICT (device_hash) DO UPDATE')
  expect(values).not.toContain(deviceCode)
  expect(values[0]).toMatch(/^[a-f0-9]{64}$/)
})

test('fails closed when durable rate limiting is unavailable', async () => {
  const previous = process.env.DATABASE_URL
  delete process.env.DATABASE_URL
  await expect(consumeTrialPollBudget('sensitive-device-code-1234567890')).rejects.toThrow('trial-database-unavailable')
  if (previous) process.env.DATABASE_URL = previous
})
