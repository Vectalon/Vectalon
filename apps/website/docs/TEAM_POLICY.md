# Org-wide guardrail policy with `sync` — setup guide

One policy change in the team repo propagates to every project that follows
it. `vectalon team-policy` publishes your project's guardrail policy + shared
bundle budgets through the same git remote `vectalon sync` uses; consuming
projects cache it at `.vectalon/team/org-policy.json` and every gating surface
(policy checks, code review, the MCP review tool, bundle budgets) layers it
under the project's own `.vectalon/policy.json`.

Both `vectalon sync` and `vectalon team-policy` require the **Team tier**
(start a 14-day trial with `npx vectalon auth --github`, or visit
<https://vectalon.in/trial?product=rn>). For the full option reference, see
[`CLI_REFERENCE.md` → `sync`](./CLI_REFERENCE.md#sync) and
[`CLI_REFERENCE.md` → `team-policy`](./CLI_REFERENCE.md#team-policy).

## 1. Initialize both projects

The publishing project (your team repo) and every consuming project need a
`.vectalon/` workspace first:

```bash
cd team-repo
npx vectalon init            # publish from this project

cd ../consumer-app
npx vectalon init            # consume in this project
```

## 2. Configure the sync remote (once, in the team repo)

```bash
cd team-repo
npx vectalon sync --init --remote git@github.com:org/team-brain.git
```

This writes `.vectalon/sync.json` (remote + branch, default `main`). The same
remote hosts both the team brain (`sync --push`/`--pull`) and the org policy
(`team-policy --push`/`--pull`).

## 3. Author the policy and publish it

```bash
npx vectalon policy --init          # create .vectalon/policy.json
# … edit .vectalon/policy.json: rule overrides, custom rules, code-review tuning

# Optional: set shared bundle budgets that travel with the policy
npx vectalon team-policy --budget '{"largeLibBytes":65536}'

npx vectalon team-policy --push     # publish policy + budgets to the remote
```

`--push` publishes the raw `.vectalon/policy.json` exactly as edited (no
normalized defaults) plus the local budgets, stamped with a version and
timestamp. Confirm what you just shipped:

```bash
npx vectalon team-policy --show     # effective policy + budget settings
```

## 4. Pull the org policy into a second project

```bash
cd ../consumer-app
npx vectalon sync --init --remote git@github.com:org/team-brain.git   # same remote
npx vectalon team-policy --pull     # cache org policy at .vectalon/team/org-policy.json
```

The pulled policy is **effective immediately** — no restart, no rebuild.
Verify the consumer sees it:

```bash
npx vectalon team-policy --show     # "org @ 2026-08-14 + local"
npx vectalon team-policy --check src/App.tsx   # run the effective (org + local) policy
```

## Everyday management

```bash
npx vectalon team-policy                      # status: remote, cached org policy, budgets
npx vectalon team-policy --push               # re-publish after editing policy.json
npx vectalon team-policy --budget '{"largeLibBytes":65536}'   # local override (consumer)
npx vectalon team-policy --check src/App.tsx  # check one file against the effective policy
npx vectalon team-policy --remove             # stop following the org policy (local only)
```

When the org policy changes, consumers just run `vectalon team-policy --pull`
again — or script it into their CI so every project re-syncs on a schedule.

## Notes

- **Tier:** `sync` and `team-policy` are Team-tier commands; the free tier
  reports the tier gate and points at the trial.
- **The remote is shared:** `sync` moves the knowledge base, `team-policy`
  moves the policy. Both read the same `.vectalon/sync.json` — configure it
  once per project.
- **Local policy always layers on top:** consumers keep their own
  `.vectalon/policy.json`; the org policy is a base, not a replacement.
  `--remove` deletes the cached copy so the project enforces local rules only.
