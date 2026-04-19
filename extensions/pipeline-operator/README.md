# Pipeline Operator Chrome Extension

Manifest V3 extension that pre-fills Greenhouse application forms for operator-assisted submissions.

## Installation (Development / Unpacked)

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select `extensions/pipeline-operator/` from this repo

No build step required — the extension uses plain JS (no bundler for v1).

## Usage

1. In the Pipeline admin panel, open an application with status **Awaiting Operator**.
2. Click **"Open Greenhouse (prefilled)"**.
3. The admin page opens the Greenhouse job URL in a new tab.
4. The extension pre-fills: first name, last name, email (tracking address), phone, location, preferred name, country, resume (uploaded from DO Spaces), custom question answers, and EEOC demographic fields.
5. **Review all fields.** The extension does not auto-submit.
6. Click **Submit application** in Greenhouse.
7. Return to the admin panel and click **Mark Submitted** (optionally paste the Greenhouse application ID).

## Token Flow

```
Admin page
  └─ POST /api/admin/applications/[id]/fill-package
       └─ Returns: { token, expiresAt, applicationId }
           └─ window.open(greenhouse_url)
               └─ localStorage.setItem("PIPELINE_FILL_TOKEN", JSON.stringify({ token, applicationId }))
                   └─ background.js reads from chrome.storage.local change
                       └─ tabs.sendMessage(tabId, { type: "PIPELINE_FILL", token })
                           └─ content.js decodes JWT, fills form
```

Tokens are kept **in memory only** — never persisted to extension storage.

## Snapshot Shape (`snap` in content.js)

The JWT payload's `snapshot` object contains:

| Field | Description |
|---|---|
| `firstName` / `lastName` | Legal name (text inputs) |
| `email` / `trackingEmail` | Tracking email for inbound routing |
| `phone` / `location` | Standard fields |
| `resumeFileName` / `presignedResumeUrl` | Resume attach via background.js |
| `questionAnswers` | `{ fieldName: value }` map for answered questions |
| `questionMeta` | Array of `{ label, fieldName, fieldType, selectValues? }` (one entry per field) |
| `pendingQuestions` | Questions the profile could not auto-answer (one entry per field) |
| `coreFieldExtras` | Extra profile data for Greenhouse core fields (see below) |

### `coreFieldExtras`

```json
{
  "preferredFirstName": "Alex",
  "country": "USA",
  "eeoc": {
    "gender": "Female",
    "race": "White",
    "veteranStatus": "I am not a protected veteran",
    "disability": "No, I do not have a disability"
  }
}
```

- `preferredFirstName` → filled into `#preferred_name` text input
- `country` → filled into `#country` react-select
- `eeoc.*` → filled into demographic react-selects read from `window.__remixContext`

## React-Select Fill Pattern

**Why no native `<select>`?** Greenhouse's job board SPA uses [react-select](https://react-select.com/) for every dropdown — Country, work authorization questions, application questions, and demographic fields. The DOM has **zero** native `<select>` elements.

**Fill sequence:**

```
1. document.getElementById(fieldId)   → HTMLInputElement with role="combobox"
2. Walk up to div.select__control
3. Click the control (or Toggle button) to open the dropdown
4. Wait 400ms for div.select__menu to appear
5. Query .select__option elements, match by text or data-value
6. dispatchEvent mousedown + click on matching option
```

**Functions:**
- `fillReactSelect(fieldId, targetValue, selectValues)` — single-select
- `fillReactMultiSelect(fieldId, valueIds, selectValues)` — multi-select (calls fillReactSelect per id)

`selectValues` is the `field.values` array from the Greenhouse API (`{ value: number, label: string }[]`). When it's provided, `targetValue` is matched to a label. When it's `null` (e.g. country), `targetValue` is treated directly as the label text.

## Demographics from Remix Context

Demographic questions (gender, race, veteran, disability) are served by Greenhouse's Remix SPA via `window.__remixContext`. They are **not** in the `questions[]` API endpoint.

The extension reads `window.__remixContext.state.loaderData` to find `demographicQuestions.questions[]`, then matches profile EEOC label strings (`coreFieldExtras.eeoc`) to option names in the page. Matching is case-insensitive exact.

If `window.__remixContext` is unavailable, demographics remain for the operator to fill manually — this is non-fatal.

## Permissions

| Permission | Reason |
|---|---|
| `scripting` | Inject content script into Greenhouse pages |
| `tabs` | Detect active Greenhouse tabs for token relay |
| `storage` | Relay fill-package token from admin page (localStorage bridge) |
| `host_permissions: job-boards.greenhouse.io` | Scoped to Greenhouse job board pages only |

## Token Expiry

Fill-package tokens expire in **15 minutes**. The presigned resume URL inside the token expires in **5 minutes**. If you take more than ~4 minutes to open the form after clicking "Open Greenhouse", click the button again to regenerate.

## Troubleshooting

- **Form not filling**: Open DevTools console on the Greenhouse page and check for `Pipeline Operator:` banner messages.
- **"Token expired"**: Regenerate from admin panel.
- **Popup blocked**: Allow popups from the admin origin, or use the localhost `PIPELINE_FILL_TOKEN` localStorage bridge.
- **Dropdowns not selecting**: Ensure `questionMeta[n].fieldType` matches the actual Greenhouse field type. react-select fields require `multi_value_single_select` or `multi_value_multi_select` in the snapshot.
- **Demographics not filling**: Open DevTools and check `window.__remixContext?.state?.loaderData` for a `demographicQuestions` key. If absent, fill manually.
