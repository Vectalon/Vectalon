/**
 * API Layer Generator tests — roadmap 020: OpenAPI parsing, typed services,
 * error handling, caching.
 * Business Source License 1.1 (BSL-1.1)
 */
import { buildApiClient, parseOpenApi } from '../../src/sdlc/ApiClientGenerator'

const OPENAPI = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'User Service' },
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/users': {
      get: { operationId: 'listUsers', responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/UserList' } } } } } },
      post: { operationId: 'createUser', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } }, responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } } },
    },
    '/users/{id}': {
      get: { operationId: 'getUser', responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } } },
      delete: { operationId: 'deleteUser', responses: { '200': { content: { 'application/json': { schema: { type: 'boolean' } } } } } },
    },
  },
  components: {
    schemas: {
      User: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'integer' }, name: { type: 'string' }, email: { type: 'string' } } },
      UserList: { type: 'array', items: { $ref: '#/components/schemas/User' } },
    },
  },
})

describe('API client generator (020)', () => {
  test('parses an OpenAPI document into a spec', () => {
    const spec = parseOpenApi(OPENAPI)
    expect(spec.name).toBe('UserServiceApi')
    expect(spec.baseUrl).toBe('https://api.example.com/v1')
    expect(spec.endpoints.map(e => e.name).sort()).toEqual(['createUser', 'deleteUser', 'getUser', 'listUsers'])
    const getUser = spec.endpoints.find(e => e.name === 'getUser')!
    expect(getUser.response).toBe('User')
    expect(getUser.path).toBe('/users/{id}')
    const createUser = spec.endpoints.find(e => e.name === 'createUser')!
    expect(createUser.body).toBe('User')
  })

  test('rejects an OpenAPI document with no paths', () => {
    expect(() => parseOpenApi(JSON.stringify({ openapi: '3.0.0', info: { title: 'x' } }))).toThrow(/no paths/)
    expect(() => parseOpenApi('not json')).toThrow(/Invalid OpenAPI/)
  })

  test('builds a typed client with error handling', () => {
    const spec = parseOpenApi(OPENAPI, 'UserApi')
    const { content } = buildApiClient(spec)
    expect(content).toContain('export class UserApi')
    expect(content).toContain('interface User')
    expect(content).toContain('listUsers(): Promise<UserList>')
    expect(content).toContain('export type UserList = User[]')
    expect(content).toContain('createUser(body: User): Promise<User>')
    expect(content).toContain('getUser(param: string | number): Promise<User>')
    expect(content).toContain('const pathTemplate = `/users/${encodeURIComponent(param)}`')
    expect(content).toContain('throw new ApiError')
    expect(content).toContain("import { ApiError } from './apiBase'")
    // Path params get encoded into the URL template.
    expect(content).toContain('encodeURIComponent(param)')
  })

  test('cache TTL adds read + write through an in-memory cache', () => {
    const spec = parseOpenApi(OPENAPI, 'CachedApi')
    spec.endpoints = spec.endpoints.map(e => (e.name === 'listUsers' ? { ...e, cacheTtl: 30 } : e))
    const { content } = buildApiClient(spec)
    expect(content).toContain('private cache = new Map')
    expect(content).toContain('Date.now() - cached.at < 30 * 1000')
    expect(content).toContain('this.cache.set(cacheKey')
  })

  test('handles a minimal manual spec without OpenAPI', () => {
    const { content } = buildApiClient({
      name: 'HealthApi',
      baseUrl: 'https://health.example.com',
      endpoints: [{ name: 'ping', method: 'GET', path: '/ping', response: '{ ok: boolean }', cacheTtl: 5 }],
    })
    expect(content).toContain('ping(): Promise<{ ok: boolean }>')
    expect(content).toContain('cached.at < 5 * 1000')
  })
})
