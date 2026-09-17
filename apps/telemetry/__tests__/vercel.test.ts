import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const dir = mkdtempSync(join(tmpdir(), 'vectalon-wrapper-test-'))
const originalStoreEnv = { DATA_DIR: process.env.DATA_DIR, KV_REST_API_URL: process.env.KV_REST_API_URL, KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN }
process.env.DATA_DIR = dir
delete process.env.KV_REST_API_URL
delete process.env.KV_REST_API_TOKEN
type Handler = typeof import('../api/v1/errors').default
let dashboard: Handler, errors: Handler, heartbeat: Handler, support: Handler, admin: Handler, health: Handler

const originalToken = process.env.TELEMETRY_ADMIN_TOKEN
before(async () => {
  process.env.TELEMETRY_ADMIN_TOKEN = 'wrapper-test-token'
  ;({ default: dashboard } = await import('../api/index'))
  ;({ default: errors } = await import('../api/v1/errors'))
  ;({ default: heartbeat } = await import('../api/v1/heartbeat'))
  ;({ default: support } = await import('../api/v1/support'))
  ;({ default: admin } = await import('../api/v1/admin/errors'))
  ;({ default: health } = await import('../api/v1/health'))
})
after(() => {
  if (originalToken === undefined) delete process.env.TELEMETRY_ADMIN_TOKEN
  else process.env.TELEMETRY_ADMIN_TOKEN = originalToken
  for (const [key, value] of Object.entries(originalStoreEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(dir, { recursive: true, force: true })
})

const attack = '<img src=x onerror=alert(1)>'
async function invoke(handler: Handler, method: string, url: string, body: unknown = {}, authorized = false) {
  const result = { status: 0, headers: {} as Record<string, string>, body: '', transport: '' }
  const req = { method, url, body, headers: { authorization: authorized ? 'Bearer wrapper-test-token' : attack, accept: 'text/html', 'content-type': 'text/html' } } as unknown as VercelRequest
  const res = {
    status(code: number) { result.status = code; return this },
    setHeader(key: string, value: string) { result.headers[key.toLowerCase()] = value; return this },
    send(value: string) { result.body = value; result.transport = 'send'; return this },
    end(value?: string) { result.body = value ?? ''; result.transport = 'end'; return this },
    json(value: unknown) { result.body = JSON.stringify(value); result.transport = 'json'; result.headers['content-type'] = 'application/json; charset=utf-8'; return this },
  } as unknown as VercelResponse
  await handler(req, res)
  return result
}

test('Vercel wrappers explicitly send reflected errors as JSON, never HTML', async () => {
  for (const handler of [dashboard, errors, heartbeat, support, admin, health]) {
    for (const [method, url] of [[attack, '/'], ['GET', `/unknown/${attack}`], ['GET', '/?token=wrapper-test-token']]) {
      const result = await invoke(handler, method, url, { message: attack })
      assert.match(result.headers['content-type'], /^application\/json/)
      assert.equal(result.headers['x-content-type-options'], 'nosniff')
      assert.equal(result.transport, 'json')
      assert.doesNotThrow(() => JSON.parse(result.body))
      assert.notEqual(result.status, 200)
    }
  }
})

test('Vercel anonymous POST validation and empty preflight retain safe transports', async () => {
  for (const [handler, url, status] of [[errors, '/v1/errors', 200], [heartbeat, '/v1/heartbeat', 400], [support, '/v1/support', 400]] as const) {
    const result = await invoke(handler, 'POST', url, { message: attack })
    assert.equal(result.status, status)
    assert.equal(result.transport, 'json')
    assert.match(result.headers['content-type'], /^application\/json/)
    const preflight = await invoke(handler, 'OPTIONS', url)
    assert.equal(preflight.status, 204)
    assert.equal(preflight.body, '')
  }
})

test('Vercel dashboard remains protected and intentional HTML is escaped', async () => {
  const denied = await invoke(dashboard, 'GET', '/')
  assert.equal(denied.status, 401)
  assert.equal(denied.transport, 'json')
  const ingested = await invoke(errors, 'POST', '/v1/errors', { events: [{ message: attack, command: attack }] })
  assert.equal(ingested.status, 200)
  for (const handler of [errors, admin]) {
    const listed = await invoke(handler, 'GET', handler === admin ? '/v1/admin/errors' : '/v1/errors', {}, true)
    assert.equal(listed.status, 200)
    assert.equal(listed.transport, 'json')
    assert.match(listed.headers['content-type'], /^application\/json/)
    assert.equal(JSON.parse(listed.body).errors[0].message, attack)
  }
  const html = await invoke(dashboard, 'GET', '/', {}, true)
  assert.equal(html.status, 200)
  assert.equal(html.headers['content-type'], 'text/html; charset=utf-8')
  assert.equal(html.headers['x-content-type-options'], 'nosniff')
  assert.match(html.body, /<!doctype html>/)
  assert.doesNotMatch(html.body, /<img src=x onerror=/)
  assert.match(html.body, /&lt;img src=x onerror=alert\(1\)&gt;/)
})
