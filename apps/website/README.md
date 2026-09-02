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

- `LEMONSQUEEZY_STORE_ID` (the store subdomain) and the configured product variant IDs
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

## Pages

- `/` — Landing page
- `/pricing` — Pricing tiers
- `/trial` — Start trial (GitHub OAuth)
- `/docs` — Documentation
- `/changelog` — Release notes
- `/blog` — Technical content

## License

Business Source License 1.1 (BSL-1.1) — see [LICENSE](../../LICENSE) for details.
