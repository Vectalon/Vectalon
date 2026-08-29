// Force ANSI color support for picocolors in the test environment.
// picocolors reads FORCE_COLOR (and isTTY) at import time; under CI stdout is
// not a TTY so colors are otherwise stripped, which made ANSI-aware assertions
// (table renderer widths, color helpers) environment-dependent.
// This file runs before any test module loads, so every import sees colors on.
process.env.FORCE_COLOR = '1'
// Existing suites exercise the full pre-freeze surface. The opt-in is explicit
// in the test harness and never changes production defaults or entitlements.
process.env.VECTALON_EXPERIMENTAL = '1'
