/**
 * Lightweight MCP tool-argument validation (P2-18).
 *
 * Tools declare their input shape with a JSON-schema-ish `inputSchema`
 * (type: object, properties, required). Before a handler runs, the server
 * validates the incoming arguments against `required` + the property types
 * and returns a structured MCP error instead of letting a blind
 * `args.prompt as string` cast crash with `TypeError: Cannot read property`.
 * No dependency, no codegen — just enough to prevent the half of MCP server
 * crashes that come from missing/typed fields.
 */

export interface ValidationIssue {
  /** Field name (e.g. "prompt"). */
  path: string
  /** Human-readable message. */
  message: string
}

interface SchemaProperty {
  type?: string
}

function propertyTypeOf(props: Record<string, unknown> | undefined, key: string): string | undefined {
  const prop = props?.[key]
  if (prop && typeof prop === 'object' && !Array.isArray(prop)) {
    const type = (prop as SchemaProperty).type
    return typeof type === 'string' ? type : undefined
  }
  return undefined
}

/**
 * Validate `args` against a tool's inputSchema. Returns an empty array when
 * valid. Missing required fields and wrong-typed values each produce an
 * issue; extra fields are ignored (forward-compatible).
 */
export function validateToolArgs(
  args: Record<string, unknown>,
  inputSchema: Record<string, unknown> | undefined
): ValidationIssue[] {
  if (!inputSchema || typeof inputSchema !== 'object') return []
  const issues: ValidationIssue[] = []

  const rawRequired = inputSchema.required
  const required = Array.isArray(rawRequired)
    ? rawRequired.filter((r): r is string => typeof r === 'string')
    : []
  const rawProps = inputSchema.properties
  const props = rawProps && typeof rawProps === 'object' && !Array.isArray(rawProps)
    ? (rawProps as Record<string, unknown>)
    : {}

  for (const key of required) {
    const value = args[key]
    if (value === undefined || value === null) {
      issues.push({ path: key, message: `missing required field: ${key}` })
      continue
    }
    const type = propertyTypeOf(props, key)
    if (type === 'string') {
      // An empty string is a valid input for some tools (e.g. an empty git
      // log is a legitimate "no commits yet") — only the type is enforced.
      if (typeof value !== 'string') {
        issues.push({ path: key, message: `expected string for "${key}", got ${typeof value}` })
      }
    } else if (type === 'number' && typeof value !== 'number') {
      issues.push({ path: key, message: `expected number for "${key}", got ${typeof value}` })
    } else if (type === 'boolean' && typeof value !== 'boolean') {
      issues.push({ path: key, message: `expected boolean for "${key}", got ${typeof value}` })
    }
  }

  return issues
}

/** Format validation issues as a single, readable MCP error message. */
export function formatValidationIssues(issues: ValidationIssue[]): string {
  return `Invalid tool arguments: ${issues.map(i => i.message).join('; ')}`
}
