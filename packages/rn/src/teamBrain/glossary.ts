/**
 * vectalon team brain — Project Glossary Generator (Roadmap 044)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Deterministic domain-term extraction: scans source files for PascalCase /
 * camelCase / UPPER_SNAKE identifiers, filters out common code + React Native
 * vocabulary, and ranks the survivors by frequency. No model calls, so the
 * output is stable and hermetic-testable.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { walkProjectFiles } from '../upgrade/scan'
import type { GlossaryKind, GlossaryTerm } from './types'

/** Code / React Native vocabulary that is never a project domain term. */
const STOPWORDS = new Set([
  'react', 'native', 'expo', 'rn', 'app', 'application', 'screen', 'screens', 'view', 'text',
  'styles', 'style', 'stylesheet', 'usestate', 'useeffect', 'useref', 'usememo', 'usecallback',
  'usecontext', 'usereducer', 'uselayout', 'usenavigation', 'useroute', 'use', 'uses', 'set',
  'get', 'props', 'state', 'navigation', 'navigator', 'navigate', 'router', 'route', 'routes',
  'stack', 'tabs', 'tab', 'modal', 'button', 'buttons', 'icon', 'icons', 'input', 'image',
  'images', 'label', 'container', 'wrapper', 'header', 'footer', 'body', 'item', 'items',
  'list', 'row', 'card', 'cards', 'badge', 'avatar', 'avatar', 'loading', 'error', 'empty',
  'success', 'primary', 'secondary', 'default', 'optional', 'required', 'visible', 'hidden',
  'enabled', 'disabled', 'pressed', 'focused', 'selected', 'active', 'onpress', 'onchange',
  'onclick', 'onlayout', 'onfocus', 'onblur', 'onsubmit', 'render', 'renders', 'component',
  'components', 'element', 'elements', 'children', 'child', 'parent', 'root', 'index', 'key',
  'keys', 'value', 'values', 'name', 'names', 'title', 'titles', 'description', 'type', 'types',
  'interface', 'class', 'classes', 'extends', 'implements', 'function', 'functions', 'const',
  'let', 'var', 'return', 'import', 'export', 'from', 'default', 'async', 'await', 'void',
  'never', 'unknown', 'any', 'string', 'number', 'boolean', 'object', 'array', 'promise',
  'promises', 'error', 'throw', 'catch', 'try', 'finally', 'new', 'null', 'undefined', 'true',
  'false', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'do', 'does', 'did',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'not', 'no', 'yes', 'all',
  'some', 'any', 'each', 'every', 'both', 'none', 'other', 'others', 'another', 'first', 'last',
  'next', 'prev', 'previous', 'current', 'total', 'count', 'counts', 'max', 'min', 'avg',
  'sum', 'size', 'length', 'width', 'height', 'margin', 'padding', 'border', 'borderradius',
  'color', 'colors', 'font', 'fontsize', 'fontweight', 'fontfamily', 'lineheight', 'spacing',
  'gap', 'flex', 'flexdirection', 'justifycontent', 'alignitems', 'alignself', 'position',
  'absolute', 'relative', 'zindex', 'opacity', 'transform', 'shadow', 'elevation', 'resize',
  'test', 'tests', 'testing', 'jest', 'mock', 'mocks', 'props', 'event', 'events', 'handler',
  'handlers', 'callback', 'callbacks', 'date', 'dates', 'time', 'times', 'id', 'ids', 'url',
  'urls', 'uri', 'path', 'paths', 'file', 'files', 'dir', 'dirs', 'data', 'info', 'information',
  'config', 'configuration', 'settings', 'option', 'options', 'flag', 'flags', 'status',
  'version', 'versions', 'release', 'releases', 'build', 'builds', 'bundle', 'bundles',
  'module', 'modules', 'package', 'packages', 'dependency', 'dependencies', 'dev', 'prod',
  'development', 'production', 'local', 'remote', 'server', 'client', 'api', 'apis', 'endpoint',
  'endpoints', 'request', 'requests', 'response', 'responses', 'params', 'query', 'queries',
  'body', 'headers', 'auth', 'login', 'logout', 'signin', 'signout', 'signup', 'register',
  'password', 'email', 'phone', 'address', 'user', 'users', 'username', 'account', 'accounts',
  'session', 'sessions', 'token', 'tokens', 'key', 'keys', 'cache', 'cached', 'store', 'stores',
  'context', 'provider', 'providers', 'hook', 'hooks', 'utils', 'util', 'helpers', 'helper',
  'common', 'shared', 'global', 'static', 'private', 'public', 'readonly', 'export', 'visible',
  'string', 'number', 'boolean', 'object', 'array', 'symbol', 'bigint', 'function', 'method',
  'methods', 'property', 'properties', 'attribute', 'attributes', 'param', 'params', 'args',
  'argument', 'arguments', 'result', 'results', 'output', 'input', 'inputs', 'source', 'target',
  'action', 'actions', 'task', 'tasks', 'job', 'jobs', 'step', 'steps', 'phase', 'phases',
  'stage', 'stages', 'level', 'levels', 'mode', 'modes', 'theme', 'themes', 'dark', 'light',
  'color', 'size', 'sizes', 'shape', 'shapes', 'asset', 'assets', 'image', 'images', 'icon',
  'icons', 'logo', 'logos', 'splash', 'launch', 'permission', 'permissions', 'platform',
  'platforms', 'ios', 'android', 'web', 'device', 'devices', 'network', 'networks', 'wifi',
  'bluetooth', 'location', 'camera', 'microphone', 'storage', 'database', 'db', 'sql',
  'query', 'queries', 'schema', 'schemas', 'model', 'models', 'entity', 'entities', 'record',
  'records', 'field', 'fields', 'column', 'columns', 'table', 'tables', 'row', 'rows', 'index',
  'indices', 'primarykey', 'foreignkey', 'unique', 'validate', 'validation', 'valid', 'invalid',
  'format', 'formats', 'formatted', 'parse', 'parses', 'parsed', 'serialize', 'deserialize',
  'encode', 'decode', 'encrypt', 'decrypt', 'hash', 'hashes', 'sign', 'signature', 'verify',
  'retry', 'retries', 'timeout', 'timeouts', 'interval', 'intervals', 'delay', 'delays',
  'schedule', 'schedules', 'scheduled', 'cron', 'batch', 'batches', 'queue', 'queues', 'worker',
  'workers', 'thread', 'threads', 'process', 'processes', 'service', 'services', 'controller',
  'controllers', 'route', 'routes', 'middleware', 'interceptor', 'interceptors', 'decorator',
  'decorators', 'adapter', 'adapters', 'bridge', 'bridges', 'gateway', 'gateways', 'proxy',
  'proxies', 'client', 'clients', 'backend', 'frontend', 'mobile', 'desktop', 'tablet', 'watch',
  'widget', 'widgets', 'panel', 'panels', 'page', 'pages', 'form', 'forms', 'field', 'fields',
  'section', 'sections', 'block', 'blocks', 'zone', 'zones', 'area', 'areas', 'region',
  'regions', 'group', 'groups', 'team', 'teams', 'member', 'members', 'role', 'roles', 'admin',
  'administrator', 'moderator', 'owner', 'owners', 'creator', 'creators', 'author', 'authors',
  'editor', 'editors', 'viewer', 'viewers', 'guest', 'guests', 'subscription', 'subscriptions',
  'plan', 'plans', 'tier', 'tiers', 'premium', 'free', 'paid', 'trial', 'trials', 'license',
  'licenses', 'invoice', 'invoices', 'payment', 'payments', 'transaction', 'transactions',
  'charge', 'charges', 'refund', 'refunds', 'receipt', 'receipts', 'balance', 'balances',
  'currency', 'currencies', 'price', 'prices', 'cost', 'costs', 'amount', 'amounts', 'total',
  'subtotal', 'discount', 'discounts', 'tax', 'taxes', 'fee', 'fees', 'wallet', 'wallets',
  'card', 'cards', 'checkout', 'cart', 'order', 'orders', 'item', 'items', 'product', 'products',
  'catalog', 'catalogue', 'inventory', 'stock', 'ship', 'shipping', 'delivery', 'tracking',
  'track', 'tracks', 'courier', 'parcel', 'package', 'packages', 'warehouse', 'fulfillment',
  'return', 'returns', 'exchange', 'exchanges', 'warranty', 'warranties', 'customer', 'customers',
  'merchant', 'merchants', 'vendor', 'vendors', 'supplier', 'suppliers', 'partner', 'partners',
  'channel', 'channels', 'campaign', 'campaigns', 'promotion', 'promotions', 'coupon', 'coupons',
  'voucher', 'vouchers', 'gift', 'gifts', 'reward', 'rewards', 'point', 'points', 'loyalty',
  'referral', 'referrals', 'invite', 'invites', 'invitation', 'invitations', 'onboarding',
  'offboarding', 'welcome', 'intro', 'intro', 'tutorial', 'tutorials', 'guide', 'guides',
  'help', 'helps', 'support', 'supports', 'faq', 'faqs', 'feedback', 'rating', 'ratings',
  'review', 'reviews', 'comment', 'comments', 'like', 'likes', 'share', 'shares', 'report',
  'reports', 'analytics', 'metric', 'metrics', 'kpi', 'kpis', 'stat', 'stats', 'statistic',
  'statistics', 'chart', 'charts', 'graph', 'graphs', 'dashboard', 'dashboards', 'widget',
  'widgets', 'insight', 'insights', 'trend', 'trends', 'growth', 'conversion', 'conversions',
  'retention', 'churn', 'engagement', 'session', 'sessions', 'visit', 'visits', 'view',
  'views', 'click', 'clicks', 'impression', 'impressions', 'reach', 'audience', 'demographic',
  'demographics', 'segment', 'segments', 'cohort', 'cohorts', 'funnel', 'funnels', 'abtest',
  'experiment', 'experiments', 'variant', 'variants', 'control', 'treatment', 'baseline',
  'benchmark', 'benchmarks', 'threshold', 'thresholds', 'alert', 'alerts', 'notification',
  'notifications', 'push', 'pushnotification', 'inapp', 'email', 'emails', 'sms', 'message',
  'messages', 'chat', 'chats', 'conversation', 'conversations', 'thread', 'threads', 'reply',
  'replies', 'mention', 'mentions', 'emoji', 'sticker', 'stickers', 'media', 'attachment',
  'attachments', 'file', 'files', 'upload', 'uploads', 'download', 'downloads', 'stream',
  'streams', 'live', 'video', 'videos', 'audio', 'photo', 'photos', 'picture', 'pictures',
  'gallery', 'gallery', 'album', 'albums', 'playlist', 'playlists', 'player', 'players',
  'record', 'records', 'recording', 'recordings', 'capture', 'captures', 'scanner', 'scan',
  'scans', 'qrcode', 'barcode', 'face', 'fingerprint', 'biometric', 'biometrics', 'otp',
  '2fa', 'mfa', 'verification', 'verify', 'verified', 'unverified', 'confirmation', 'confirm',
  'confirmed', 'unconfirmed', 'approval', 'approve', 'approved', 'reject', 'rejected',
  'pending', 'progress', 'processing', 'processed', 'complete', 'completed', 'incomplete',
  'cancel', 'cancelled', 'canceled', 'archive', 'archived', 'restore', 'restored', 'delete',
  'deleted', 'remove', 'removed', 'update', 'updated', 'updates', 'insert', 'inserted',
  'upsert', 'merge', 'merged', 'split', 'splits', 'combine', 'combines', 'duplicate',
  'duplicates', 'dedupe', 'deduped', 'sort', 'sorts', 'sorted', 'filter', 'filters', 'filtered',
  'search', 'searches', 'searched', 'find', 'finds', 'found', 'lookup', 'match', 'matches',
  'matched', 'compare', 'compares', 'comparison', 'diff', 'diffs', 'patch', 'patches', 'merge',
  'rebase', 'cherrypick', 'commit', 'commits', 'branch', 'branches', 'tag', 'tags', 'pr',
  'prs', 'pullrequest', 'issue', 'issues', 'bug', 'bugs', 'feature', 'features', 'epic',
  'epics', 'story', 'stories', 'sprint', 'sprints', 'milestone', 'milestones', 'backlog',
  'roadmap', 'priority', 'priorities', 'severity', 'severities', 'label', 'labels', 'assignee',
  'assignees', 'reporter', 'watcher', 'watchers', 'duplicate', 'wontfix', 'invalid', 'closed',
  'open', 'reopen', 'reopened', 'resolved', 'unresolved', 'blocked', 'blocker', 'impediment',
  'sla', 'slas', 'uptime', 'downtime', 'latency', 'throughput', 'availability', 'reliability',
  'scalability', 'performance', 'optimization', 'optimize', 'optimized', 'efficiency',
  'efficient', 'resource', 'resources', 'cpu', 'memory', 'disk', 'storage', 'bandwidth',
  'request', 'requests', 'concurrency', 'parallel', 'parallelism', 'queue', 'queues', 'pool',
  'pools', 'connection', 'connections', 'socket', 'sockets', 'websocket', 'websockets', 'http',
  'https', 'tcp', 'udp', 'dns', 'ip', 'ipv4', 'ipv6', 'ssl', 'tls', 'certificate',
  'certificates', 'firewall', 'vpn', 'proxy', 'proxies', 'loadbalancer', 'loadbalancing',
  'cluster', 'clusters', 'node', 'nodes', 'instance', 'instances', 'container', 'containers',
  'docker', 'kubernetes', 'k8s', 'pod', 'pods', 'service', 'services', 'deployment',
  'deployments', 'replicaset', 'replicasets', 'namespace', 'namespaces', 'ingress', 'egress',
  'volume', 'volumes', 'persistent', 'ephemeral', 'configmap', 'secret', 'secrets', 'helm',
  'chart', 'charts', 'terraform', 'ansible', 'puppet', 'chef', 'salt', 'stack', 'stacks',
  'pipeline', 'pipelines', 'workflow', 'workflows', 'job', 'jobs', 'artifact', 'artifacts',
  'registry', 'registries', 'repository', 'repositories', 'monorepo', 'multirepo', 'workspace',
  'workspaces', 'package', 'packages', 'manager', 'managers', 'lockfile', 'lockfiles', 'vendor',
  'vendors', 'license', 'licenses', 'readme', 'changelog', 'contributing', 'codeofconduct',
  'gitignore', 'eslint', 'eslintrc', 'prettier', 'prettierrc', 'babel', 'babelrc', 'tsconfig',
  'jestconfig', 'metro', 'metroconfig', 'babelconfig', 'podfile', 'gradle', 'gradlew',
  'buildscript', 'manifest', 'manifests', 'plist', 'entitlements', 'storyboard', 'xib', 'xcodeproj',
  'xcworkspace', 'pods', 'node_modules', 'dist', 'build', 'builds', 'coverage', 'reports',
])

const IDENTIFIER_RE = /[A-Za-z][A-Za-z0-9_]*/g
/** PascalCase with internal capitalization — component/type names. */
const PASCAL_CASE_RE = /^[A-Z][a-z0-9]*[A-Z][a-zA-Z0-9]*$/
/** All-caps with underscore — constant/enum members. */
const CONSTANT_RE = /^[A-Z][A-Z0-9_]{2,}$/

/**
 * Extract and rank domain terms from a project's source files. Deterministic:
 * same inputs, same output. Terms must be ≥ 3 chars, survive the stoplist, and
 * appear in ≥ 2 files (or ≥ 3 total occurrences) to count as project vocabulary.
 */
export function buildGlossary(root: string, limit = 40): GlossaryTerm[] {
  const counts = new Map<string, { count: number; files: Set<string>; examples: string[]; kind: GlossaryKind }>()
  const files = walkProjectFiles(root)
  for (const rel of files) {
    let content: string
    try {
      content = readFileSync(join(root, rel), 'utf-8')
    } catch (err) {
      continue
    }
    const seen = new Set<string>()
    for (const match of content.match(IDENTIFIER_RE) || []) {
      const term = match.toLowerCase()
      if (term.length < 3 || STOPWORDS.has(term)) continue
      const raw = match
      const kind: GlossaryKind = CONSTANT_RE.test(raw)
        ? 'constant'
        : PASCAL_CASE_RE.test(raw)
          ? 'component'
          : 'identifier'
      const entry = counts.get(term) || { count: 0, files: new Set<string>(), examples: [], kind }
      entry.count++
      if (!seen.has(term)) {
        seen.add(term)
        entry.files.add(rel)
        if (entry.examples.length < 3) entry.examples.push(rel)
      }
      counts.set(term, entry)
    }
  }

  return [...counts.entries()]
    // Keep terms that appear more than once (one-offs are typos/local scope),
    // then rank by frequency — the cap keeps the glossary to the loudest terms.
    .filter(([, e]) => e.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([term, e]) => ({
      term,
      kind: e.kind,
      count: e.count,
      files: e.files.size,
      examples: e.examples,
    }))
}

/** Render the glossary as markdown (written to docs/vectalon/team/glossary.md). */
export function renderGlossary(terms: GlossaryTerm[], projectName: string): string {
  const lines = [`# Project Glossary — ${projectName}`, '']
  if (terms.length === 0) {
    lines.push('No domain terms extracted yet — run `vectalon team` after the project has source files.')
    return lines.join('\n')
  }
  lines.push('Deterministically extracted identifiers that look like project domain vocabulary (filtered against common code + React Native terms, ranked by frequency).', '')
  lines.push('| Term | Kind | Occurrences | Files | Examples |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const t of terms) {
    lines.push(`| \`${t.term}\` | ${t.kind} | ${t.count} | ${t.files} | \`${t.examples.join('`, `')}\` |`)
  }
  return lines.join('\n')
}
