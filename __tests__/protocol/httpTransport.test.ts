import { MCPServer } from '../../src/protocol/MCPServer'
import { ContextEngine } from '../../src/harness/ContextEngine'
import { ModelRouter } from '../../src/model/ModelRouter'
import { ArtifactStore } from '../../src/knowledge/ArtifactStore'
import { resetConfig } from '../../src/config'
import { createTempProject, cleanup, useTempConfig } from '../helpers/tmp'

const PROJECT = {
  'package.json': JSON.stringify({
    name: 'app',
    version: '1.0.0',
    dependencies: { 'react-native': '0.72.0' },
    devDependencies: { jest: '29.7.0' },
  }),
  'src/Home.tsx': [
    "import React from 'react'",
    'const Home = () => null',
    'export default Home',
    '',
  ].join('\n'),
}

describe('MCPServer HTTP transport', () => {
  let dir: string
  let configDir: string

  beforeEach(() => {
    dir = createTempProject(PROJECT)
    configDir = useTempConfig()
    resetConfig()
  })

  afterEach(() => {
    cleanup(dir)
    cleanup(configDir)
  })

  async function startServer(): Promise<{ server: MCPServer; port: number }> {
    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    const server = new MCPServer(engine, router, 'http')
    const port = (await server.start(0)) as number
    return { server, port }
  }

  it('GET / advertises the tool list and running status', async () => {
    const { server, port } = await startServer()
    try {
      const res = await fetch(`http://localhost:${port}/`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { tools: Array<{ name: string }>; status: string }
      expect(body.status).toBe('running')
      expect(body.tools.map(t => t.name)).toContain('get_project_context')
    } finally {
      server.close()
    }
  })

  it('GET /tools is an alias for discovery', async () => {
    const { server, port } = await startServer()
    try {
      const res = await fetch(`http://localhost:${port}/tools`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { tools: Array<{ name: string }> }
      expect(body.tools.map(t => t.name)).toContain('write_prd')
    } finally {
      server.close()
    }
  })

  it('POST /call invokes a tool and returns the result', async () => {
    const { server, port } = await startServer()
    try {
      const res = await fetch(`http://localhost:${port}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'http-1',
          name: 'suggest_dependency_update',
          arguments: { packageName: 'react-native' },
        }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { id: string; content: string }
      expect(body.id).toBe('http-1')
      const suggestion = JSON.parse(body.content)
      expect(suggestion.status).toBe('update-available')
    } finally {
      server.close()
    }
  })

  it('POST /invoke is an alias for /call', async () => {
    const { server, port } = await startServer()
    try {
      const res = await fetch(`http://localhost:${port}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'get_project_context' }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { content: string }
      expect(body.content).toContain('# Project: app v1.0.0')
    } finally {
      server.close()
    }
  })

  it('POST /call returns a 200 with isError when a tool handler fails', async () => {
    const engine = new ContextEngine(dir)
    engine.init()
    const router = new ModelRouter()
    router.initialize({ provider: 'local' })
    const store = new ArtifactStore(dir)
    const server = new MCPServer(engine, router, 'http', store)
    const port = (await server.start(0)) as number
    try {
      const res = await fetch(`http://localhost:${port}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'get_artifact', arguments: { id: 'missing' } }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { isError?: boolean; content: string }
      expect(body.isError).toBe(true)
      expect(body.content).toContain('Artifact not found')
    } finally {
      server.close()
    }
  })

  it('POST /call with an unknown tool returns 404', async () => {
    const { server, port } = await startServer()
    try {
      const res = await fetch(`http://localhost:${port}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'no_such_tool' }),
      })
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('Unknown tool')
    } finally {
      server.close()
    }
  })

  it('POST /call with invalid JSON returns 400', async () => {
    const { server, port } = await startServer()
    try {
      const res = await fetch(`http://localhost:${port}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
      expect(res.status).toBe(400)
    } finally {
      server.close()
    }
  })

  it('POST /call without a name returns 400', async () => {
    const { server, port } = await startServer()
    try {
      const res = await fetch(`http://localhost:${port}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arguments: {} }),
      })
      expect(res.status).toBe(400)
    } finally {
      server.close()
    }
  })

  it('wrong method on a known path returns 405', async () => {
    const { server, port } = await startServer()
    try {
      const res = await fetch(`http://localhost:${port}/tools`, { method: 'POST' })
      expect(res.status).toBe(405)
    } finally {
      server.close()
    }
  })

  it('unknown paths return 404', async () => {
    const { server, port } = await startServer()
    try {
      const res = await fetch(`http://localhost:${port}/nope`)
      expect(res.status).toBe(404)
    } finally {
      server.close()
    }
  })

  it('responses carry CORS headers for web dashboards', async () => {
    const { server, port } = await startServer()
    try {
      const res = await fetch(`http://localhost:${port}/tools`)
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
      expect(res.headers.get('access-control-allow-methods')).toContain('POST')

      const preflight = await fetch(`http://localhost:${port}/call`, { method: 'OPTIONS' })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
    } finally {
      server.close()
    }
  })

  it('close() shuts the HTTP server down', async () => {
    const { server, port } = await startServer()
    server.close()
    await expect(fetch(`http://localhost:${port}/tools`)).rejects.toThrow()
  })

  it('start() returns the bound port when auto-assigned', async () => {
    const { server, port } = await startServer()
    try {
      expect(typeof port).toBe('number')
      expect(port).toBeGreaterThan(0)
    } finally {
      server.close()
    }
  })
})
