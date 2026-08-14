/**
 * API Layer Generator (Roadmap 020) — typed service clients with error
 * handling and response caching. Accepts an OpenAPI-style spec (paths +
 * schemas) or a minimal `{ baseUrl, endpoints }` shape; deterministic.
 * Business Source License 1.1 (BSL-1.1)
 */

export interface ApiEndpoint {
  name: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  /** Response type name (must exist in `types`). */
  response: string
  /** Request body type name, when any. */
  body?: string
  /** Query param names, when any. */
  params?: string[]
  /** Cache TTL in seconds; 0 disables caching for this endpoint. */
  cacheTtl?: number
}

export interface ApiSpec {
  /** Client class name, e.g. "UserApi". */
  name: string
  baseUrl: string
  endpoints: ApiEndpoint[]
  /** Additional type declarations emitted into the generated file. */
  types?: Record<string, string>
}

export interface GeneratedApiClient {
  spec: ApiSpec
  /** Single self-contained TypeScript source file. */
  content: string
}

interface OpenApiLike {
  openapi?: string
  info?: { title?: string }
  servers?: { url?: string }[]
  paths?: Record<string, Record<string, unknown>>
  components?: { schemas?: Record<string, unknown> }
}

const methodMap: Record<string, ApiEndpoint['method']> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
}

/** Infer a TS type name from an OpenAPI schema object. */
function schemaType(schema: Record<string, unknown> | undefined): string {
  if (!schema) return 'unknown'
  if (typeof schema.$ref === 'string') return (schema.$ref as string).split('/').pop() || 'unknown'
  if (Array.isArray(schema.type)) return schema.type.join(' | ')
  switch (schema.type) {
    case 'string':
      return (schema as { enum?: unknown[] }).enum ? ((schema as { enum: unknown[] }).enum.map(v => JSON.stringify(v)).join(' | ')) : 'string'
    case 'integer':
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return `${schemaType(schema.items as Record<string, unknown>)}[]`
    case 'object':
      return 'Record<string, unknown>'
    default:
      return 'unknown'
  }
}

/** Parse an OpenAPI document into an ApiSpec; throws on unusable input. */
export function parseOpenApi(doc: string | Record<string, unknown>, name = 'Api'): ApiSpec {
  let raw: OpenApiLike
  try {
    raw = typeof doc === 'string' ? (JSON.parse(doc) as OpenApiLike) : (doc as OpenApiLike)
  } catch (err) {
    throw new Error(`Invalid OpenAPI JSON: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!raw.paths || Object.keys(raw.paths).length === 0) {
    throw new Error('OpenAPI document has no paths — expected { "paths": { "/route": { get: {...} } } }')
  }
  const endpoints: ApiEndpoint[] = []
  const types: Record<string, string> = {}
  const schemas = raw.components?.schemas ?? {}
  for (const [schemaName, schema] of Object.entries(schemas)) {
    const s = schema as Record<string, unknown>
    if (s.type === 'object' && s.properties && typeof s.properties === 'object') {
      const fields = Object.entries(s.properties as Record<string, unknown>)
        .map(([k, v]) => {
          const prop = v as Record<string, unknown>
          const required = Array.isArray(s.required) && (s.required as unknown[]).includes(k)
          return `  ${k}${required ? '' : '?'}: ${schemaType(prop)}`
        })
        .join('\n')
      types[schemaName] = `export interface ${schemaName} {\n${fields}\n}`
    } else {
      types[schemaName] = `export type ${schemaName} = ${schemaType(s)}`
    }
  }
  for (const [path, methods] of Object.entries(raw.paths)) {
    for (const [method, opRaw] of Object.entries(methods ?? {})) {
      const methodUpper = methodMap[method.toLowerCase()]
      if (!methodUpper) continue
      const op = opRaw as Record<string, unknown>
      const operationId = typeof op.operationId === 'string' ? op.operationId : `${method}${path.replace(/[^a-zA-Z0-9]/g, '')}`
      const responses = op.responses as Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }> | undefined
      const responseSchema = responses?.['200']?.content?.['application/json']?.schema
      const requestBody = typeof op.requestBody === 'object' && op.requestBody !== null
        ? ((op.requestBody as Record<string, unknown>).content as Record<string, { schema?: Record<string, unknown> }> | undefined)?.['application/json']?.schema
        : undefined
      endpoints.push({
        name: operationId,
        method: methodUpper,
        path,
        response: responseSchema ? schemaType(responseSchema) : 'unknown',
        body: requestBody ? schemaType(requestBody) : undefined,
      })
    }
  }
  const baseUrl = raw.servers?.[0]?.url ?? 'https://api.example.com'
  const inferredName = name === 'Api' && raw.info?.title ? `${raw.info.title.replace(/[^a-zA-Z0-9]/g, '')}Api` : name
  return { name: inferredName, baseUrl, endpoints, types }
}

function paramString(endpoint: ApiEndpoint): string {
  if (!endpoint.params || endpoint.params.length === 0) return ''
  const params = endpoint.params.join(', ')
  return `params?: { ${params}: string | number }`
}

/** Build a single self-contained TS file implementing the spec. */
export function buildApiClient(spec: ApiSpec): GeneratedApiClient {
  const { name, baseUrl, endpoints } = spec
  const typeLines = Object.values(spec.types ?? {})

  const methods = endpoints.map(endpoint => {
    const method = endpoint.method
    const pathParams = [...endpoint.path.matchAll(/\{([^}]+)\}/g)].map(m => m[1])
    const pathTemplate = endpoint.path.replace(/\{([^}]+)\}/g, (_m, name: string) => {
      const index = pathParams.indexOf(name)
      return `\${encodeURIComponent(param${pathParams.length > 1 ? index + 1 : ''})}`
    })
    const args: string[] = []
    pathParams.forEach((_, i) => args.push(`param${pathParams.length > 1 ? i + 1 : ''}: string | number`))
    if (endpoint.body) args.push(`body: ${endpoint.body}`)
    const paramList = paramString(endpoint)
    if (paramList) args.push(paramList)
    const hasQuery = endpoint.params && endpoint.params.length > 0
    const ttl = endpoint.cacheTtl ?? 0
    const cacheLines: string[] = []
    if (ttl > 0) {
      cacheLines.push(`    const cacheKey = \`${method}:\${url}\``)
      cacheLines.push(`    const cached = this.cache.get(cacheKey)`)
      cacheLines.push(`    if (cached && Date.now() - cached.at < ${ttl} * 1000) return cached.value as ${endpoint.response}`)
    }
    const storeLine = ttl > 0 ? `    this.cache.set(cacheKey, { at: Date.now(), value: data })` : ''
    const queryExpr = hasQuery
      ? ` + (params ? '?' + Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => \`\${k}=\${encodeURIComponent(v)}\`).join('&') : '')`
      : ''
    return `  async ${endpoint.name}(${args.join(', ')}): Promise<${endpoint.response}> {
    const pathTemplate = \`${pathTemplate}\`
    const url = \`\${this.baseUrl}\${pathTemplate}\`${queryExpr}
${cacheLines.length > 0 ? cacheLines.join('\n') + '\n' : ''}    const res = await fetch(url, {
      method: '${method}',
      headers: { 'Content-Type': 'application/json' }${endpoint.body ? `,\n      body: JSON.stringify(body)` : ''},
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new ApiError(\`\${res.status} \${res.statusText}\`, res.status, detail)
    }
    const data = await res.json() as ${endpoint.response}
${storeLine ? storeLine + '\n' : ''}    return data
  }`
  })

  const header = [
    `/* Generated by vectalon generate api. */`,
    `import { ApiError } from './apiBase'`,
    '',
    ...(typeLines.length > 0 ? [...typeLines, ''] : []),
  ]

  const body = [
    `export class ${name} {`,
    `  private readonly baseUrl: string`,
    `  private cache = new Map<string, { at: number; value: unknown }>()`,
    '',
    `  constructor(baseUrl: string = '${baseUrl}') {`,
    `    this.baseUrl = baseUrl.replace(/\\/$/, '')`,
    '  }',
    '',
    ...methods,
    '}',
    '',
    `export default ${name}`,
    '',
  ]

  return {
    spec,
    content: [...header, ...body].join('\n'),
  }
}

/** Render the client as a markdown manifest (MCP tool return / CLI --json). */
export function renderApiClient(api: string | ApiSpec): string {
  let spec: ApiSpec
  if (typeof api === 'string') {
    spec = parseOpenApi(api)
  } else {
    spec = api
  }
  const fence = '```'
  return [
    `# API client: ${spec.name}`,
    '',
    `**baseUrl:** \`${spec.baseUrl}\` · **endpoints:** ${spec.endpoints.length}`,
    '',
    '## Endpoints',
    '',
    ...spec.endpoints.map(e => `- \`${e.method} ${e.path}\` → \`${e.name}\` : Promise<${e.response}>`),
    '',
    '## Source',
    '',
    fence,
    buildApiClient(spec).content.trimEnd(),
    fence,
    '',
  ].join('\n')
}
