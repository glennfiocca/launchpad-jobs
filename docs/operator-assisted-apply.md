# Operator-Assisted Application Pipeline

When Playwright automation is blocked by a CAPTCHA or browser failure, the application is routed to the **operator queue** instead of hard-failing. An admin completes the submission in a real browser with the Chrome extension pre-filling the Greenhouse form.

---

## State Machine

```
POST /api/applications
        │
        ▼
   Application created (submissionStatus=PENDING)
        │
        ▼ (background Playwright runs)
        ├─ Success ──────────────────────────────► submissionStatus=SUBMITTED
        │                                          dispatchMode=AUTOMATED
        │
        ├─ CAPTCHA_REQUIRED / BROWSER_LAUNCH_FAILED / NO_CONFIRMATION
        │   └──────────────────────────────────► submissionStatus=AWAITING_OPERATOR
        │                                         applicationSnapshot stored
        │                                         audit: PLAYWRIGHT_RESULT
        │
        └─ Other error (PLAYWRIGHT_ERROR) ───────► submissionStatus=FAILED
```

### AWAITING_OPERATOR sub-flow

```
AWAITING_OPERATOR
     │
     ├─ Admin claims     → audit: CLAIM
     ├─ Admin releases   → audit: RELEASE
     ├─ Fill package     → JWT signed (15 min TTL), presign URL (5 min TTL)
     │                     audit: FILL_PACKAGE_ISSUED
     │
     ├─ Operator submits → submissionStatus=SUBMITTED, dispatchMode=ASSISTED
     │                     audit: OPERATOR_SUBMITTED
     │
     └─ Operator fails   → submissionStatus=FAILED, dispatchMode=ASSISTED
                           APPLY_FAILED notification sent to user
                           audit: OPERATOR_FAILED
```

---

## Claim Rules

- Any admin can claim an unclaimed application.
- Only the claiming operator can release (or any admin for force-release via API).
- Parallel `POST /claim` → first write wins; second gets **409 Conflict**.
- Fill-package auto-claims if the application is unclaimed when the button is clicked.

---

## Presign Expiry

The presigned resume URL has a **300-second (5-minute) TTL**.

> **Warn operators**: If there is a delay of more than ~4 minutes between opening the form and filling it, click **"Open Greenhouse (prefilled)"** again to regenerate a fresh fill package with a new presigned URL.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `APPLICATION_FILL_PACKAGE_SECRET` | Yes | HMAC-SHA256 key for fill-package JWTs. Generate: `openssl rand -base64 32` |
| `OPERATOR_QUEUE_CODES` | No | Comma-separated Playwright error codes that route to the queue. Default: `CAPTCHA_REQUIRED,BROWSER_LAUNCH_FAILED,NO_CONFIRMATION` |

---

## Admin UI

- **`/admin/queue`** — Table of all `AWAITING_OPERATOR` applications with claim status, time in queue, SLA indication.
- **`/admin/applications/[id]`** — When `submissionStatus === AWAITING_OPERATOR`, shows the Operator Queue section with:
  - Snapshot summary (applicant, tracking email, board/job, resume filename)
  - Claim / Release button
  - "Open Greenhouse (prefilled)" — generates fill package and opens Greenhouse tab
  - "Mark Submitted" modal (optional Greenhouse application ID + notes)
  - "Mark Failed" modal (required reason)
  - Audit Log tab — chronological CLAIM / RELEASE / FILL_PACKAGE_ISSUED / OPERATOR_SUBMITTED / OPERATOR_FAILED / PLAYWRIGHT_RESULT events

---

## Chrome Extension

See `extensions/pipeline-operator/README.md` for first-time installation instructions.

As of v1.1.1 the extension matches `<all_urls>` and self-gates on the `#pipelineFill=` JWT hash, so it injects on **any** apply page (Greenhouse, Ashby, and self-hosted careers pages such as `cursor.com/careers`, `deel.com/careers`, etc.) without needing per-domain manifest entries. The script no-ops on every other page.

### Updating the extension

The extension is distributed as unpacked source — there is no Chrome Web Store listing. To pick up code changes:

1. Operator pulls the latest `launchpad` repo (`git pull`).
2. Open `chrome://extensions/`.
3. Click the **Refresh** icon on the *Pipeline Operator* card.
4. Confirm the version on the card matches `manifest.json`.

The extension will now inject on any URL when a `#pipelineFill=` hash is present (including self-hosted careers pages). No reinstall, no zip, no review.

### Greenhouse (`job-boards.greenhouse.io`)

1. Receives a JWT fill-package token from the admin page.
2. Decodes the snapshot (no re-verification needed — server validates before signing).
3. Fetches the presigned resume URL and attaches the file to the `<input type="file">`.
4. Fills first name, last name, email (uses tracking email), phone, location, custom question answers.
5. Handles react-select dropdowns via CDP click simulation.
6. Fills EEOC demographic fields from Remix page context.
7. **Does not auto-submit** — operator reviews and clicks Submit.

### Ashby (`jobs.ashbyhq.com`)

1. Same JWT fill-package token delivery (URL hash or session storage).
2. Fills name (single combined field: `_systemfield_name`), email (`_systemfield_email`), phone (`_systemfield_phone`).
3. Fills LinkedIn (`_systemfield_linkedin`), GitHub (`_systemfield_github`), website (`_systemfield_website`) when present.
4. Fetches presigned resume URL and attaches via `input[type="file"]`.
5. Custom questions: matched by field name/id, supports standard HTML selects (no react-select).
6. **Does not auto-submit** — operator reviews and clicks Submit.

#### Ashby-specific selectors

| Field | Selector pattern |
|---|---|
| Name | `input[name*="_systemfield_name"]` |
| Email | `input[name*="_systemfield_email"]` |
| Phone | `input[name*="_systemfield_phone"]` |
| LinkedIn | `input[name*="_systemfield_linkedin"]` |
| GitHub | `input[name*="_systemfield_github"]` |
| Website | `input[name*="_systemfield_website"]` |
| Resume | `input[type="file"]` |

#### Known limitations (Ashby)

- EEOC/demographic fields are not auto-filled (Ashby uses a different survey format).
- No navigation cascade to embed URLs (Ashby does not use the same embed pattern as Greenhouse).
- CDP click simulation is not used — Ashby uses standard HTML form elements.

---

## Troubleshooting

| Problem | Resolution |
|---|---|
| "No Greenhouse URL in snapshot" | Job's `absoluteUrl` was null at apply time. Navigate to the job manually. |
| "Fill package token has expired" | Click "Open Greenhouse (prefilled)" again to regenerate. |
| Extension not filling form | Ensure extension is loaded unpacked in Chrome. Check popup shows "Active on N Greenhouse tab(s)". |
| `APPLICATION_FILL_PACKAGE_SECRET` not set | Fill-package endpoint returns 500. Add env var and redeploy. |
| 409 on claim | Another operator claimed first. Refresh the queue. |
