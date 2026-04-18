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
4. The extension pre-fills: first name, last name, email (tracking address), phone, location, resume (uploaded from DO Spaces), and any custom question answers.
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

- **Form not filling**: Open DevTools console on the Greenhouse page and check for `Pipeline:` banner messages.
- **"Token expired"**: Regenerate from admin panel.
- **Popup blocked**: Allow popups from the admin origin, or use the localhost `PIPELINE_FILL_TOKEN` localStorage bridge.
