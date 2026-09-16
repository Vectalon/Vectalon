/**
 * Vectalon Website
 * Business Source License 1.1 (BSL-1.1)
 * 
 * Landing page, pricing, documentation, and blog.
 */

# vectalon.in

**The Vectalon website and documentation.**

## Tech Stack

- Next.js + Tailwind CSS
- Vercel hosting
- Mintlify for documentation

## Development

```bash
cd apps/website
pnpm install
pnpm dev
```

## Production checkout

Paid checkout fails closed unless the deployment has all of the following:

- `LEMONSQUEEZY_STORE_ID` (the store subdomain), reusable checkout UUIDs in
  `LEMONSQUEEZY_CHECKOUT_<TIER>_<PRODUCT>`, and numeric webhook variant IDs in
  `LEMONSQUEEZY_VARIANT_<TIER>_<PRODUCT>`
- `LEMONSQUEEZY_WEBHOOK_SECRET`
- `VECTALON_LICENSE_PRIVATE_KEY` — an RSA private key of at least 2048 bits; escaped newlines are accepted
- `VECTALON_KEY_ID` — the key identifier used by both the website signer and the client verifier (defaults to `vectalon-legacy`)
- `DATABASE_URL` for durable orders, customers, and licenses

The private key must match `packages/core/public-key.pem`. Never commit it. Set
the same `VECTALON_KEY_ID` in the website deployment and in any client
environment that overrides the default. `RESEND_API_KEY` and the configured
sender are required for automatic license delivery email.

Subscription purchases receive a 35-day signed offline credential. Active
subscription webhooks rotate the credential through the next renewal date and
email the replacement; cancellation and refunds revoke online access while the
last signed credential ages out within that bounded window.

## Operator dashboard (Step 10, release pending)

The Admin-owned control plane is hosted only at `/admin`; no separate Admin deployment is needed.
Configure `GITHUB_OAUTH_CLIENT_ID` with device flow enabled, `VECTALON_OPERATOR_ORIGIN=https://vectalon.in`,
an independent `ADMIN_SESSION_SECRET` of at least 32 characters, and the dedicated
`VECTALON_OPERATOR_DATABASE_URL` plus verified `VECTALON_OPERATOR_DATABASE_SSL_CA`.
Keep these credentials in Production only; previews require isolated storage and their own explicit HTTPS origin.
Legacy passwords and static admin cookies do not authorize access.

Approved initial platform admins are `bhishaksanyal` and `MoumitaM`, bound to stable GitHub IDs.
Platform admins can add, change or revoke other operators at `/admin/access`; the last platform admin
cannot be removed, and membership changes revoke the target's sessions. Mutations require same-origin CSRF,
a reason and GitHub authentication within five minutes. Existing dashboard customer writes receive an immutable
authorization audit before execution; they remain separate from the operator transaction.

Internal RN credentials last five minutes, grant full tier access without commercial quotas, and activate through
`auth --operator-license-file` in a separate store without replacing paid licenses. Provider restrictions remain.
Website tests and production build pass; real GitHub login, runtime issuance and release verification remain required.

## Pages

- `/` — Landing page
- `/pricing` — Pricing tiers
- `/trial` — Start trial (GitHub OAuth)
- `/docs` — Documentation
- `/changelog` — Release notes
- `/blog` — Technical content

## License

Business Source License 1.1 (BSL-1.1) — see [LICENSE](../../LICENSE) for details.
