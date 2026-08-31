# RN capability freeze

The executable catalog lives in `packages/rn/src/capabilities/catalog.json`.
`surfaces.json` inventories source declarations, including conditional MCP tools,
extension handlers, runtime exports, public documents, routes, plans, demos and
benchmark scenarios. Declared counts are not enabled counts or quality evidence.
User-configured third-party MCP integrations are outside Vectalon qualification.

Beta means the cited, scoped fixture workflow passed, not production reliability.
Experimental commands/tools require `VECTALON_EXPERIMENTAL=1`; CLI `--experimental`
also opts in. `--dev` does not bypass lifecycle checks. Existing tier checks remain
independent. Planned/removed functionality cannot run. Deprecation notices, if
announced, retain migration, removal and license-effect metadata; none is invented.

`pnpm capabilities:check -- --base <previous-main-sha>` compares source and evidence
digests plus lifecycle history against Git, retaining removed tombstones and
rejecting new implemented breadth. CI supplies its trusted event base, not an
editable catalog snapshot. Initial adoption is limited to the recorded Step 04 base.
`pnpm capabilities:qualify` reruns the narrowly listed fixture workflows and captures
their output. It does not create performance, support, or GA evidence.

No paid outcome currently meets `available` qualification, so new checkout and
new paid grants are closed. Existing license validation and subscription servicing
continue. Free zero-price entitlement is separate from the BSL commercial-use
grant for teams of at most three developers. New Team terms are RN-only, per-seat,
with no fixed tier cap or future-product grant. Existing customer contracts are
not rewritten. Enterprise sales is qualification, not a claim of unbuilt controls.
