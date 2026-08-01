/**
 * Real dynamic import helper.
 *
 * TypeScript with `module: "commonjs"` rewrites `await import(...)` into
 * `require(...)` at compile time, which breaks ESM-only packages that use
 * top-level await. Using a Function constructor keeps the native `import()`
 * call in the compiled output, so Node.js can load ESM modules from a CommonJS
 * context.
 */
export const dynamicImport = new Function('modulePath', 'return import(modulePath)') as <T>(modulePath: string) => Promise<T>
