# Pipeline Hardening + Apply Workflow Spec

**Status**: Decisions locked, ready to implement
**Author**: produced from a single multi-hour session ending 2026-05-05
**Scope**: every gap left by the company-name + logo + URL + sync work shipped this session
**Goal**: zero remaining "we'll deal with that later" items

---

## Decisions locked in (resolved by user before context-clear)

1. **Browser extension distribution** → installed manually from a zip; operator clicks "Refresh" in `chrome://extensions` to pull updates. **No Chrome Web Store review delay.** A.3 reduces to: edit `manifest.json` + `content.js`, the user refreshes the loaded extension.
2. **Apply selector strategy (A.2)** → generic selectors first; add per-company `applySelector` overrides ONLY for self-hosters where the generic chain fails during testing.
3. **Heartbeat service (C.3)** → Healthchecks.io free tier.
4. **Override migration (B.4)** → DB is runtime source of truth; existing TS map becomes a deploy-time seed (`prisma/seed-overrides.ts`) so a fresh deploy bootstraps the same overrides without manual entry.
5. **Daily digest recipients (C.4)** → query `users WHERE role = 'ADMIN'`, send to all.
6. **Spaces prune cadence (C.1)** → weekly cron.
7. **CAPTCHA strategy (A.2)** → unchanged. Self-hosters route to the operator queue with the existing error codes.
8. **Greenhouse self-hoster audit (A.5)** → 10-board spot-check before closing the track.

---

## TL;DR

Today we landed a layered website + logo resolver, an Ashby self-hoster URL discovery pipeline, sync-time auto-rewriting of `absoluteUrl`, US-eligibility filtering, saved-jobs collapse, and a 6-hour cron cadence. **What we did NOT close**:

1. **Auto-apply for Ashby self-hosters is broken** — `Job.applyUrl` still points at the dead `jobs.ashbyhq.com/{board}/{uuid}/application` URL even though `Job.absoluteUrl` was correctly rewritten. The Playwright apply path uses `applyUrl` and the browser extension only matches `job-boards.greenhouse.io/*` and `jobs.ashbyhq.com/*`, neither of which is a self-hoster's domain.
2. **Logo accuracy is opportunistic, not verified** — ~150–200 Greenhouse companies still rely on heuristic-derived websites. We have no automated check that the website actually serves the right brand.
3. **Operational hygiene gaps** — orphaned Spaces objects accumulate; sync errors only surface in the admin dashboard or stdout (no alerting); Sentry has a DSN but is not wired into sync code.
4. **Override map lives in TypeScript** — adding a brand requires a code commit + deploy, which is friction for routine ops work.

Plan is organised into four tracks, **A** through **D**, ordered by impact (A is critical user-facing breakage, D is polish).

---

## Goals

- Auto-apply works for **every Ashby self-hoster** the moment a user clicks "Apply" — no manual fallback for the 19 self-hosters we have today.
- Browser extension fills forms on company-hosted careers pages (cursor.com, deel.com, etc.), not just `job-boards.greenhouse.io` and `jobs.ashbyhq.com`.
- Logos derive from verified-correct websites for **>95%** of the 600-company catalogue, with mismatches automatically flagged for review.
- Sync failures generate an alert within **5 minutes** of detection, not a silent admin-dashboard entry.
- Spaces stays clean — orphan ratio under **10%** of total objects.
- Adding a logo override is an admin-UI click, not a code commit.

## Non-goals

- Rewriting the apply Playwright from scratch. We adapt the existing strategy.
- Adding a paid monitoring service. Sentry + a free heartbeat (Healthchecks.io) is enough.
- Auto-discovering brand-new ATS providers (Workable, Lever). The current Greenhouse + Ashby coverage is the scope.
- Rebuilding the browser extension UI. We expand its `host_permissions` and content-script targeting; we don't redesign the operator flow.

---

## Track A — Apply Workflow Hardening (CRITICAL)

The deeplink for "View original listing" is now correct for self-hosters, but the *application submission path* still hits dead URLs. This is the highest-impact gap.

### A.1 Rewrite `Job.applyUrl` for Ashby self-hosters at sync time

**Problem.** `src/app/api/applications/route.ts:310` builds an apply URL fallback as `https://jobs.ashbyhq.com/{boardToken}/{externalJobId}/application` when `Job.applyUrl` is null. For self-hosters this URL renders an empty SPA shell — the form never mounts. Even when `Job.applyUrl` is non-null, it was set by the Ashby mapper to that same dead URL pattern.

**Fix.** Mirror what we did for `absoluteUrl` in the Ashby `getJobs()` client (`src/lib/ats/providers/ashby/client.ts`):

```ts
// existing slug/fallback resolution already happens in getJobs()
const slugUrl = customMap.byUuid.get(job.externalId);
const fallbackUrl = customMap.buildFallbackUrl(job.externalId);
const newUrl = slugUrl ?? fallbackUrl;
return newUrl
  ? { ...job, absoluteUrl: newUrl, applyUrl: newUrl }  // ← also rewrite applyUrl
  : job;
```

We use the same URL for both fields. The "Apply" button on a self-hoster's careers page IS on the same page as the listing.

**Tasks**
- [ ] A.1.1 — Modify `mapAshbyJobToNormalized` in `src/lib/ats/providers/ashby/mapper.ts` so `applyUrl` defaults to `null` instead of the broken Ashby URL (we'll let the client re-derive both URLs together)
- [ ] A.1.2 — Update `getJobs()` in the Ashby client to set `applyUrl = absoluteUrl` for self-hosters (slug or fallback)
- [ ] A.1.3 — Add stickiness rule in `sync.ts`: don't downgrade a curated `applyUrl` (mirror `shouldPreserveAbsoluteUrl`)
- [ ] A.1.4 — Migration / one-time backfill of `Job.applyUrl` for existing rows (mirror `scripts/backfill-ashby-custom-urls.ts`, or extend that script)

**Acceptance**: For every active Ashby job whose company has `customJobsPageUrl` set, `Job.applyUrl` lives on the company's domain (or equals `Job.absoluteUrl`).

### A.2 Adapt `AshbyApplyStrategy` to use the rewritten URL + click "Apply"

**Problem.** The Playwright strategy at `src/lib/ats/providers/ashby/playwright-apply.ts` navigates to the supplied `applyUrl` and waits for an Ashby form. For self-hosters the URL is now correct, but the page is the company's careers page, not a bare Ashby form — the user has to click an "Apply" button on the page first.

**Fix.** Add a "find and click apply button" step before the existing `waitForFormLoad`:

1. Navigate to `applyUrl` (the custom URL).
2. Look for a clickable apply trigger using a fallback selector chain:
   - `a[href="#apply"]`
   - `a:has-text("Apply for this job")`
   - `button:has-text("Apply")`
   - `[data-action="apply"]`
3. Click it — many sites scroll to or open an in-page form.
4. Then proceed with existing form-fill logic.

If we land on a page that doesn't match any of the above selectors after a 3-second wait, fall back to the existing logic (the form may already be on the page).

**Tasks**
- [ ] A.2.1 — Add `clickApplyTrigger(page)` helper to the Ashby Playwright module
- [ ] A.2.2 — Wire it into the apply flow before `waitForFormLoad`
- [ ] A.2.3 — Per-company quirk handling: for self-hosters where the apply button uses an unusual selector, allow per-company override via `Company.applySelector?` (new optional field) or via the override map
- [ ] A.2.4 — End-to-end smoke test against Cursor, Deel, FullStory using a fixture profile

**Acceptance**: an auto-apply submitted against any of the 19 known self-hosters either succeeds or fails cleanly with an actionable error (`FORM_NOT_FOUND`, `CAPTCHA_REQUIRED`) routed to the operator queue. No more `404`-equivalent silent failures.

### A.3 Browser extension custom-domain support

**Problem.** `extensions/pipeline-operator/manifest.json` matches only `job-boards.greenhouse.io/*` and `jobs.ashbyhq.com/*`. On `cursor.com/careers/...` the content script never injects, so JWT-snapshot autofill never runs for self-hoster apply pages.

**Fix.** Move from a static `host_permissions` list to optional permissions or a broader pattern:

- **Option A (recommended)**: Use `optional_host_permissions` + a per-domain consent flow. Whenever the operator visits a self-hoster's careers URL, the extension prompts for permission to inject. Adds one click per new domain but keeps the user in control.
- **Option B**: Add an explicit domain list synced from the server. Run an admin endpoint that returns `[{host, providerHint}]` for every self-hoster. Extension fetches on startup + caches.
- **Option C** (simplest, riskier): Match `<all_urls>` and gate behavior by the JWT-snapshot URL hash — only inject when `#pipelineFill=` is present.

**Recommendation: Option C**. The extension only acts when explicitly invoked via the JWT URL hash, so broad host permissions aren't a security expansion in practice. Operators won't see unwanted UI.

**Tasks**
- [ ] A.3.1 — Update `manifest.json` `host_permissions` to `["<all_urls>"]`
- [ ] A.3.2 — Update `content_scripts.matches` accordingly
- [ ] A.3.3 — Audit `content.js` to ensure it short-circuits cleanly when no JWT hash is present
- [ ] A.3.4 — Bump the extension `version` field. Tell the user to click "Refresh" in `chrome://extensions` (manual install — no CWS publish needed)
- [ ] A.3.5 — Document the install flow update in `docs/operator-assisted-apply.md`

**Acceptance**: An operator can paste a JWT-snapshot URL targeting `cursor.com/careers/software-engineer-growth#pipelineFill=...` and the extension fills the form.

### A.4 Adapt the JWT snapshot generator

**Problem.** When the apply flow generates an operator-assisted URL, it currently appends `#pipelineFill=<JWT>` to `Job.applyUrl`. With A.1 done, that URL is already correct for self-hosters — but we should verify the snapshot URL builder doesn't hardcode the Ashby pattern anywhere.

**Tasks**
- [ ] A.4.1 — Audit `src/lib/fill-package-jwt.ts` (and any `operator URL` builder) for hardcoded `jobs.ashbyhq.com` patterns
- [ ] A.4.2 — Confirm the snapshot URL is built from `Job.applyUrl` only, no fallbacks

**Acceptance**: Generated operator URLs land on the company's careers page (when applicable), not the dead Ashby SPA.

### A.5 Greenhouse parity check

**Problem.** Per user observation, Greenhouse self-hosters mostly redirect cleanly — the dead-link case is rare. But we should at least audit.

**Tasks**
- [ ] A.5.1 — Sample 10 random Greenhouse companies' apply URLs in headless Chromium; verify the form mounts
- [ ] A.5.2 — If the failure rate is >5%, file a follow-on track. Otherwise close.

---

## Track B — Logo + URL Quality

We're at "mostly accurate" — pushing to "verified accurate" requires a content-check pass and a runtime override system.

### B.1 Content verification script

**Problem.** ~150–200 Greenhouse companies have heuristic-derived websites. Some are correct, some aren't (squatted `.com` domains pointing to unrelated brands). We have no tool to find the wrong ones.

**Fix.** New script `scripts/verify-company-websites.ts`:

1. Iterate every Company with non-null `website`.
2. Fetch the homepage HTML (10 second timeout, follow redirects).
3. Extract candidate brand signals:
   - `<title>` text
   - `<meta property="og:site_name">` content
   - `<meta name="application-name">` content
   - JSON-LD `Organization.name`
4. Compute a fuzzy similarity between each candidate and `Company.name` (Levenshtein normalised, or token overlap).
5. Score each company. Output a CSV sorted by suspicion (lowest similarity first).
6. Top suspicious entries get reviewed; obvious mismatches get override-map entries.

**Tasks**
- [ ] B.1.1 — Build the script with `--top=N` to print only the N most suspicious
- [ ] B.1.2 — Run against prod, eyeball top-50, add overrides for the wrong ones
- [ ] B.1.3 — Document the workflow in `docs/HARDENING_PLAN.md` (this file) for future use

**Acceptance**: a clean run with top-suspicion list reviewed, all clear matches > 0.6 similarity, mismatches < 5% of catalogue.

### B.2 Subdomain canonicalisation

**Problem.** Several discovered websites are subdomains: `careers.datadoghq.com`, `jobs.elastic.co`, `careers.airbnb.com`. logo.dev *may* not resolve subdomains to the parent brand. The cleanest URL for logo lookup is the apex.

**Fix.** Add an apex-stripper to the Greenhouse/Ashby website discovery:

```ts
function toApex(url: string): string {
  const u = new URL(url);
  const host = u.hostname;
  const stripPrefixes = ["careers.", "jobs.", "apply.", "career.", "join."];
  for (const prefix of stripPrefixes) {
    if (host.startsWith(prefix)) {
      return `${u.protocol}//${host.slice(prefix.length)}`;
    }
  }
  return url;
}
```

Apply during `discoverGreenhouseWebsite` and `discoverAshbyWebsite`. Existing rows updated by re-running website discovery.

**Tasks**
- [ ] B.2.1 — Implement `toApex()` in `src/lib/website-discovery/`
- [ ] B.2.2 — Apply in both Ashby and Greenhouse discoverers
- [ ] B.2.3 — Re-run discovery against prod with `--apply` to fix existing rows
- [ ] B.2.4 — Re-run logo backfill to refresh logos for changed websites

**Acceptance**: zero `careers.X.com` style subdomains in `Company.website` for any non-overridden company.

### B.3 Greenhouse loop-back recovery via redirect-follow

**Problem.** ~302 Greenhouse companies have job pages whose canonical URL loops back to `greenhouse.io`. But Greenhouse often returns a 301 redirect at the public-board URL itself, pointing to the company's actual careers page — we just don't follow + capture that signal in the discovery script.

**Fix.** Add a "follow redirect once" mode to the Greenhouse discovery: instead of just parsing the response body, capture the final `Location` header chain and use that as the website signal. Many of the 302 misses become hits this way.

**Tasks**
- [ ] B.3.1 — Modify `discoverGreenhouseViaHttp` to capture redirect chain (`fetch` with `redirect: "manual"`, walk redirects)
- [ ] B.3.2 — Apex-strip the redirect target (B.2)
- [ ] B.3.3 — Re-run discovery with `--apply`

**Acceptance**: hit rate increases from ~58/410 to >150/410 for fresh discovery.

### B.4 Admin "Logo Overrides" page

**Problem.** Adding a brand override (`okta: { logoUrl: "..." }`) requires editing `src/lib/company-logo/overrides.ts`, opening a PR, deploying. Friction for what should be a 30-second admin task.

**Fix.** Migrate the override map from TypeScript constants to a database table; surface it as an admin page.

**Schema**
```prisma
model CompanyLogoOverride {
  id        String      @id @default(cuid())
  provider  AtsProvider
  slug      String
  website   String?
  logoUrl   String?
  notes     String?     @db.Text
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  @@unique([provider, slug])
}
```

**Behaviour**
- `lookupLogoOverride(provider, slug)` reads from DB first, falls back to the TS map (so the existing 120 entries keep working)
- Admin can create / edit / delete via UI
- Edit triggers a refetch (calls existing `/api/admin/companies/[id]/refetch-logo`)

**Page design** (clones `src/app/(admin)/admin/companies/page.tsx`):
- Table: provider | slug | website override | logoUrl override | actions
- "Add override" modal with form fields + live logo preview
- "Refresh logo" button per row
- Search/filter

**Tasks**
- [ ] B.4.1 — Prisma migration for `CompanyLogoOverride` table
- [ ] B.4.2 — Seed migration: copy existing TS map entries into the table
- [ ] B.4.3 — Update `lookupLogoOverride()` to query DB (with in-process cache, 60s TTL)
- [ ] B.4.4 — New API: `GET /api/admin/logo-overrides`, `POST /api/admin/logo-overrides`, `PATCH /api/admin/logo-overrides/[id]`, `DELETE /api/admin/logo-overrides/[id]`
- [ ] B.4.5 — New page: `src/app/(admin)/admin/logo-overrides/page.tsx`
- [ ] B.4.6 — Sidebar link in `admin-sidebar.tsx`
- [ ] B.4.7 — Optional: keep the TS map as `seed-overrides.ts` for fresh-deploy bootstrap, but DB is source of truth

**Acceptance**: an admin can add a new brand override and see the corrected logo without a code deploy.

### B.5 logo.dev failure → monogram fallback

**Problem.** Some brands have no logo.dev coverage. `Company.logoUrl` ends up null and the UI falls back to initials. That's fine UX, but we have no awareness of how many fall through.

**Fix.** Track the resolution outcome on Company:
- `Company.logoSource: 'override' | 'logodev' | 'spaces-cache' | 'monogram' | 'none'`
- Surface a count in the admin sync dashboard

Also: enable logo.dev's `?fallback=monogram` parameter as our render-time fallback (we already discussed but didn't implement). Modifies `getLogoUrl()` to add `&fallback=monogram` so a render against a non-existent brand returns a monogram-style placeholder rather than a 404.

**Tasks**
- [ ] B.5.1 — Add `logoSource` to Company schema
- [ ] B.5.2 — Populate it in enrichment + override paths
- [ ] B.5.3 — Add `fallback=monogram` to `getLogoUrl()`
- [ ] B.5.4 — Surface a "logos by source" stat in the admin dashboard

**Acceptance**: dashboard shows the source distribution. Brands without logo.dev coverage render a monogram, not initials.

---

## Track C — Operational Hygiene

Things that don't directly affect users today but accumulate technical debt.

### C.1 Spaces orphan prune

**Problem.** Every time `Company.website` changes, the old `logos/{old-hostname}.png` stays in Spaces, unreferenced.

**Fix.** New script `scripts/prune-orphan-logos.ts`:

```
1. Add list / bulk-delete helpers to src/lib/spaces.ts
2. List all objects under logos/ prefix (paginated)
3. Build "in-use" set: SELECT logoUrl FROM Company WHERE logoUrl IS NOT NULL
4. Diff: in S3, not in DB → orphan list
5. Dry-run by default; --apply deletes via DeleteObjectsCommand (1k batches)
```

**Tasks**
- [ ] C.1.1 — Extend `src/lib/spaces.ts` with `listObjects(prefix)` and `deleteObjects(keys[])`
- [ ] C.1.2 — Build the prune script with dry-run/apply pattern
- [ ] C.1.3 — Run dry-run against prod, eyeball orphan count
- [ ] C.1.4 — Run `--apply`. Confirm orphan count drops to ~0
- [ ] C.1.5 — Add cron schedule (weekly) — small DO scheduled job, ~30s runtime

**Acceptance**: orphan ratio (orphans / total objects) under 10% steady-state.

### C.2 Sync error alerting via Sentry

**Problem.** Sentry has DSN set but the sync code doesn't call `Sentry.captureException`. Errors die in stdout.

**Fix.** Wrap each board sync + the top-level run with explicit Sentry capture:

```ts
import * as Sentry from "@sentry/nextjs";

try {
  await syncBoard(...);
} catch (err) {
  Sentry.captureException(err, { tags: { component: "sync", boardToken } });
  // existing error handling continues
}
```

**Tasks**
- [ ] C.2.1 — Confirm Sentry DSN is set in the sync-jobs env (it's currently NOT in the sync-jobs env list, only the web service)
- [ ] C.2.2 — Add SENTRY_DSN to sync-jobs env in app.yaml + apply via doctl
- [ ] C.2.3 — Wrap board-level catch + top-level catch with `Sentry.captureException`
- [ ] C.2.4 — Add structured tags: `boardToken`, `provider`, `syncLogId`
- [ ] C.2.5 — Configure Sentry alerts: page on first error, then every 10 errors, then daily summary

**Acceptance**: a forced board failure (test by passing an invalid token) shows up in Sentry within 60 seconds.

### C.3 Heartbeat monitoring

**Problem.** If the cron ITSELF fails to fire (DO scheduler bug, deploy issue), nothing alerts us. We'd notice when data goes stale.

**Fix.** Free-tier Healthchecks.io ping at the start AND end of each sync run.

```ts
// in scripts/sync-cron.ts
await fetch(`${HEALTHCHECKS_URL}/start`);
const result = await runSync(...);
await fetch(`${HEALTHCHECKS_URL}/${result.status === "FAILURE" ? "fail" : ""}`);
```

Healthchecks.io alerts (free tier) via email or Slack if no ping arrives within the expected window.

**Tasks**
- [ ] C.3.1 — Sign up for Healthchecks.io free tier, create a check with 6h interval + 30min grace
- [ ] C.3.2 — Add `HEALTHCHECKS_URL` env var to sync-jobs in app.yaml
- [ ] C.3.3 — Wire start/end pings into `scripts/sync-cron.ts`
- [ ] C.3.4 — Verify alert delivery: temporarily skip a ping, confirm alert arrives

**Acceptance**: a missed sync triggers a Healthchecks alert within 30 minutes.

### C.4 Daily digest email to admins

**Problem.** Admins should see "yesterday's syncs ran cleanly: A added, B removed, C errors" without logging into the dashboard.

**Fix.** Daily 09:00 UTC scheduled job that queries `SyncLog` for last 24h and emails admins via Resend.

**Tasks**
- [ ] C.4.1 — New scheduled job in app.yaml: `sync-digest`, cron `0 9 * * *`
- [ ] C.4.2 — `scripts/sync-digest.ts`: query, format, send via Resend to admin email list
- [ ] C.4.3 — Email template in `src/lib/email-templates.ts`
- [ ] C.4.4 — Suppress on no-news days? (probably keep it daily for assurance)

**Acceptance**: admin gets a daily email by 09:30 UTC with sync summary.

---

## Track D — Quality of Life

Small enhancements that close minor gaps.

### D.1 Structured sync logging

**Problem.** Logs are `console.log("[sync] key=val ...")`. Hard to query. Hard to plot.

**Fix.** Adopt JSON logging with a tiny logger wrapper. Output to stdout in prod (DO captures it), prettify in dev.

**Tasks**
- [ ] D.1.1 — Add `src/lib/logger.ts` minimal JSON logger (or use `pino`)
- [ ] D.1.2 — Replace `console.log("[sync] ...")` calls in sync-runner
- [ ] D.1.3 — Include syncLogId, boardToken, provider as structured fields

### D.2 Admin sync dashboard filters

**Problem.** The current dashboard at `/admin/sync` lists last 50 runs. Hard to find "show me runs that had failures last week."

**Fix.** Add filters: status (SUCCESS/PARTIAL/FAILURE), date range, provider.

**Tasks**
- [ ] D.2.1 — URL params for filters
- [ ] D.2.2 — Filter UI in the dashboard page

### D.3 Documentation refresh

**Problem.** `docs/operator-assisted-apply.md` reflects pre-self-hoster behaviour. Could mislead an operator.

**Tasks**
- [ ] D.3.1 — Update `docs/operator-assisted-apply.md` with the new flow
- [ ] D.3.2 — Add `docs/sync-playbook.md` documenting the 6h cadence, healthcheck, alert response
- [ ] D.3.3 — Update root `CLAUDE.md` with notes about the override DB table, prune cron

---

## Cross-cutting concerns

### Feature flags
- A.1 + A.2: gate on env var `APPLY_USE_CUSTOM_URLS=true`. Default true; flip to false to revert to dead-Ashby URL behaviour for forensics.
- B.4: gate the DB-backed override read on env var `LOGO_OVERRIDES_FROM_DB=true`. While migrating, both sources can coexist (DB takes precedence, falls through to TS map).

### Testing strategy
- Unit tests: pure functions (apex-stripper, content-similarity scorer, override resolver) → vitest, table-driven.
- Integration: apply flow against fixture HTML pages saved in `e2e/fixtures/self-hosters/` — Cursor, FullStory, Deel snapshots.
- E2E: Playwright test that submits an apply against a fixture self-hoster page and verifies the form is found + filled.
- Migration: idempotent (re-runs are no-ops) for every backfill script.

### Rollback plan
- A.1/A.2: revert via env flag `APPLY_USE_CUSTOM_URLS=false`. Job records keep their `applyUrl` rewrites but the apply Playwright ignores them.
- A.3: extension manifest is versioned in Chrome Web Store; we can republish previous version.
- B.4: drop DB read via `LOGO_OVERRIDES_FROM_DB=false`; TS map keeps working.
- C.x: each addition is opt-in (new env var, new ping URL); rollback = remove env var.

---

## Dependencies + sequence

```
A.1 ──┬── A.2 ── A.4 ── A.5
       │
       └── A.3 (parallel — independent)

B.2 ──┬── B.3 (uses apex-stripper)
       │
       ├── B.1 (parallel)
       │
       └── B.5 (parallel)

B.4 ── independent of all of B.1/B.2/B.3

C.1 ── independent
C.2 ──┬── C.3
       │
       └── C.4

D.x ── all independent
```

**Recommended execution order**:
1. **Day 1**: A.1, A.2, A.3, A.4 (apply workflow — biggest user-facing fix)
2. **Day 2**: B.2, B.3 (subdomain + redirect-follow — improves accuracy of existing data)
3. **Day 3**: B.1 (content verification, may surface review items requiring human time)
4. **Day 4**: B.4 (override DB + admin UI — moves ops from code to UI)
5. **Day 5**: C.1, C.2, C.3 (orphan prune + alerting — operational hygiene)
6. **Day 6**: B.5, C.4 (monogram fallback + daily digest)
7. **Day 7**: D.1, D.2, D.3 (polish)

---

## Open questions for human review

All resolved — see "Decisions locked in" at the top of this document.

---

## Out of scope (explicitly not in this plan)

- New ATS providers (Lever, Workable, Smart Recruiters)
- Mobile app
- Public API for third-parties
- Internationalisation
- Full re-architecture of the Playwright apply layer (we're patching, not rewriting)
- AI-driven brand-name matching for content verification (we use simple Levenshtein + token overlap)

---

## Acceptance criteria for the entire plan

The plan is "done" when:

- An applicant can auto-apply to **any active job** in the catalogue with the same success rate as a Greenhouse-hosted job (per provider, ≥80% direct submission, the rest routed to operator queue with actionable error). Self-hosters in particular have parity with hosted boards.
- The admin dashboard "logos by source" stat shows ≥95% of companies in `override`, `logodev`, or `spaces-cache` (i.e. real logos), <5% in `monogram` or `none`.
- A sync failure on a fresh deploy alerts an admin in under 5 minutes via Sentry + Healthchecks.
- An admin can add a new brand override in <1 minute via the admin UI without a code deploy.
- Spaces orphan ratio steady-state is <10%.

---

## Effort summary

| Track | Days | Risk |
|---|---|---|
| A — Apply workflow | 2-3 | Medium (per-company quirks during testing) |
| B — Logo + URL quality | 3-4 | Low (mostly tooling + DB migration) |
| C — Operational hygiene | 2 | Low (boring infrastructure) |
| D — Quality of life | 1-2 | Low |
| **Total** | **8-11 days** | |

For one engineer working full-time. Could parallelise A and B.

---

## Notes for the next session

When the context window is cleared and we resume, start with:
1. Re-read this file end-to-end
2. Spawn the same investigation agents if the assumptions feel stale (>2 weeks old)
3. Confirm the open questions above with the user
4. Pick a track and start. The recommended order is in "Dependencies + sequence" above.

---

## How to use: `scripts/verify-company-websites.ts` (B.1)

Read-only audit that fetches each `Company.website`, extracts brand signals (`<title>`, `og:site_name`, `application-name`, JSON-LD `Organization.name`), and computes a token-Jaccard similarity vs `Company.name`. Outputs CSV sorted ascending by score (most suspicious first).

Run:

```bash
npx tsx scripts/verify-company-websites.ts                  # full catalogue
npx tsx scripts/verify-company-websites.ts --top=50         # 50 most suspicious
npx tsx scripts/verify-company-websites.ts --threshold=0.3  # only score < 0.3
npx tsx scripts/verify-company-websites.ts --limit=20       # smoke run
npx tsx scripts/verify-company-websites.ts --companyId=cm…  # single company
```

Interpret the score: `0.0` = no signal overlap (squat / wrong brand / blocked / fetch error — see `error` col), `~0.5` = partial match (often correct — homepage title is "Brand Tagline"), `1.0` = exact match. Eyeball anything `< 0.3`; anything `>= 0.5` is almost always correct. Network errors (`TIMEOUT`/`DNS`/`403`/`429`) score 0 — separate class from real mismatches; check the `error` column before flagging.

Feeding results into the override DB: TBD until B.4 lands. For now, suspicious entries get added to `src/lib/company-logo/overrides.ts` by hand.
