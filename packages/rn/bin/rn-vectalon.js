#!/usr/bin/env node

const { runCLI } = require('../dist/cli')

runCLI().catch(err => {
  // Last-resort guard: runCLI itself threw before its try/catch could attach.
  console.error(err && err.message ? err.message : String(err))
  process.exit(1)
})
