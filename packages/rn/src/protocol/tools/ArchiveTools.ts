/**
 * Archive & Share MCP tools (design doc §8).
 *
 * Registered in `vectalon serve`. Archive/share/portal generation run for
 * real; distribution defaults to a dry-run plan (credentials are never
 * touched from a tool call without explicit confirmation, matching the
 * "never a guess, degrade explicitly" ethos of the rest of the harness).
 */

import { ToolRegistry } from './base'
import { mcpTool } from './decorators'
import { archiveBuild, detectFlavors as detectFlavorsFor } from '../../archive'
import { ArchiveStore } from '../../archive/ArchiveStore'
import { distributeBuild } from '../../distribute'
import { generatePortal } from '../../portal'
import { startShare } from '../../share'
import type { PlatformName } from '../../archive/types'

export class ArchiveTools extends ToolRegistry {
  @mcpTool('archive_build', 'Build and archive an artifact: detect flavors, run the platform build (or ingest a pre-built artifact), compute SHA-256, write a typed BuildManifest, and store it under .vectalon/builds/ — pass dryRun:true to plan without building', {
    type: 'object',
    properties: {
      directory: { type: 'string' },
      flavor: { type: 'string' },
      platform: { type: 'string', enum: ['ios', 'android'] },
      environment: { type: 'string' },
      artifact: { type: 'string' },
      noBuild: { type: 'boolean' },
      dryRun: { type: 'boolean' },
    },
  })
  async archiveBuild(args: Record<string, unknown>): Promise<string> {
    const directory = (args.directory as string) || process.cwd()
    const report = await archiveBuild(directory, {
      flavor: args.flavor as string | undefined,
      platform: args.platform as PlatformName | undefined,
      environment: args.environment as string | undefined,
      artifact: args.artifact as string | undefined,
      noBuild: args.noBuild === true,
      dryRun: args.dryRun === true,
    })
    return JSON.stringify(report, null, 2)
  }

  @mcpTool('list_builds', 'List archived builds from the local store, optionally filtered by flavor/platform', {
    type: 'object',
    properties: {
      directory: { type: 'string' },
      flavor: { type: 'string' },
      platform: { type: 'string', enum: ['ios', 'android'] },
      limit: { type: 'number' },
    },
  })
  async listBuilds(args: Record<string, unknown>): Promise<string> {
    const directory = (args.directory as string) || process.cwd()
    const store = new ArchiveStore(directory)
    const builds = store.listBuilds({
      flavor: args.flavor as string | undefined,
      platform: args.platform as string | undefined,
      limit: typeof args.limit === 'number' ? args.limit : undefined,
    })
    return JSON.stringify({ count: builds.length, builds }, null, 2)
  }

  @mcpTool('detect_flavors', 'Detect build flavors from the project: gradle productFlavors, Xcode schemes, eas.json profiles, merged with .vectalon/builds/flavors.json overrides', {
    type: 'object',
    properties: {
      directory: { type: 'string' },
    },
  })
  async detectFlavors(args: Record<string, unknown>): Promise<string> {
    const directory = (args.directory as string) || process.cwd()
    return JSON.stringify(detectFlavorsFor(directory), null, 2)
  }

  @mcpTool('distribute_build', 'Plan (or with dryRun:false, execute) a distribution of an archived build to testflight | play-store | saas | portal — credentials are never stored; dry-run is the default', {
    type: 'object',
    properties: {
      directory: { type: 'string' },
      buildId: { type: 'string' },
      target: { type: 'string', enum: ['testflight', 'play-store', 'saas', 'portal'] },
      track: { type: 'string', enum: ['internal', 'alpha', 'beta', 'production'] },
      domain: { type: 'string' },
      dryRun: { type: 'boolean' },
    },
  })
  async distributeBuild(args: Record<string, unknown>): Promise<string> {
    const directory = (args.directory as string) || process.cwd()
    const report = await distributeBuild(directory, {
      buildId: args.buildId as string | undefined,
      target: (args.target as 'testflight' | 'play-store' | 'saas' | 'portal') || 'testflight',
      track: args.track as 'internal' | 'alpha' | 'beta' | 'production' | undefined,
      domain: args.domain as string | undefined,
      dryRun: args.dryRun !== false,
    })
    return JSON.stringify(report, null, 2)
  }

  @mcpTool('share_build_locally', 'Serve an archived build on a local HTTP server with a self-contained install page — returns the URL (and tunnel plan when requested); the server must be stopped by the caller', {
    type: 'object',
    properties: {
      directory: { type: 'string' },
      buildId: { type: 'string' },
      flavor: { type: 'string' },
      platform: { type: 'string', enum: ['ios', 'android'] },
      port: { type: 'number' },
      tunnel: { type: 'boolean' },
      expires: { type: 'string' },
    },
  })
  async shareBuildLocally(args: Record<string, unknown>): Promise<string> {
    const directory = (args.directory as string) || process.cwd()
    const result = await startShare(directory, {
      buildId: args.buildId as string | undefined,
      flavor: args.flavor as string | undefined,
      platform: args.platform as 'ios' | 'android' | undefined,
      port: typeof args.port === 'number' ? args.port : undefined,
      tunnel: args.tunnel === true,
    })
    return JSON.stringify(
      { url: result.url, port: result.port, buildId: result.buildId, tunnel: result.tunnel, stop: 'caller must stop' },
      null,
      2
    )
  }

  @mcpTool('generate_portal', 'Generate a white-label static build portal from the archive store — listing, per-build detail + install pages, embedded builds.json (Team tier feature; generation itself is free)', {
    type: 'object',
    properties: {
      directory: { type: 'string' },
      out: { type: 'string' },
      domain: { type: 'string' },
      branding: { type: 'string' },
    },
  })
  async generatePortal(args: Record<string, unknown>): Promise<string> {
    const directory = (args.directory as string) || process.cwd()
    const store = new ArchiveStore(directory)
    const out = (args.out as string) || '.vectalon/portal'
    const result = generatePortal({
      out,
      domain: args.domain as string | undefined,
      builds: store.listBuilds({}),
    })
    return JSON.stringify(result, null, 2)
  }
}
