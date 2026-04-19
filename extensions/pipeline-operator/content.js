/**
 * Pipeline Operator — content script
 *
 * Injected into https://job-boards.greenhouse.io/* pages.
 *
 * Token delivery uses window.opener postMessage:
 *   1. This script sends PIPELINE_REQUEST_TOKEN to window.opener (the admin tab).
 *   2. The admin tab replies with { type: "PIPELINE_FILL", token }.
 *   3. This script decodes the JWT snapshot and fills the form.
 *
 * Does NOT auto-submit — operator reviews and clicks Submit manually.
 */

(function init() {
  // Request token from the admin tab that opened this page
  if (window.opener) {
    window.opener.postMessage({ type: "PIPELINE_REQUEST_TOKEN" }, "*")
  }

  // Also accept direct messages (e.g. from background.js relay or re-trigger)
  window.addEventListener("message", (event) => {
    if (event.data?.type === "PIPELINE_FILL" && event.data?.token) {
      fillFormFromToken(event.data.token)
    }
  })
})()

/**
 * Decode JWT payload (no signature verification — server validates before minting).
 */
function decodePayload(token) {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Set a native input value in a way React-controlled inputs detect.
 */
function nativeSet(el, value) {
  const proto = el.tagName === "TEXTAREA"
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
  if (setter) {
    setter.call(el, value)
  } else {
    el.value = value
  }
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
  el.dispatchEvent(new Event("blur", { bubbles: true }))
}

/**
 * Find a field by known name or id attributes (preferred — more reliable than label text).
 */
function findFieldByNameOrId(candidates) {
  for (const name of candidates) {
    const el = document.querySelector(
      `input[name="${name}"], input[id="${name}"], textarea[name="${name}"], textarea[id="${name}"]`
    )
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el
  }
  return null
}

/**
 * Find a form field by label text (case-insensitive substring match).
 * Checks: label[for]→id, label child, next sibling, and parent-container child
 * (handles the common Greenhouse wrapper-div pattern).
 */
function findFieldByLabel(labelText) {
  for (const label of document.querySelectorAll("label")) {
    if (!label.textContent?.toLowerCase().includes(labelText.toLowerCase())) continue

    // Strategy 1: label[for] → getElementById
    const forAttr = label.getAttribute("for")
    if (forAttr) {
      const el = document.getElementById(forAttr)
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el
    }

    // Strategy 2: input/textarea inside the label element
    const child = label.querySelector("input, textarea, select")
    if (child instanceof HTMLInputElement || child instanceof HTMLTextAreaElement) return child

    // Strategy 3: immediate next sibling
    const sibling = label.nextElementSibling
    if (sibling instanceof HTMLInputElement || sibling instanceof HTMLTextAreaElement) return sibling

    // Strategy 4: parent container's descendant input
    // Handles <div class="field"><label>…</label><div><input></div></div>
    const parent = label.parentElement
    if (parent) {
      const parentChild = parent.querySelector("input, textarea")
      if (parentChild instanceof HTMLInputElement || parentChild instanceof HTMLTextAreaElement) return parentChild
    }

    // Strategy 5: aria-label fallback on inputs
    const ariaEl = document.querySelector(
      `input[aria-label*="${labelText}" i], textarea[aria-label*="${labelText}" i]`
    )
    if (ariaEl instanceof HTMLInputElement || ariaEl instanceof HTMLTextAreaElement) return ariaEl
  }
  return null
}

/**
 * Fetch resume from presigned URL and attach to file input.
 */
async function attachResume(input, presignedUrl, fileName) {
  try {
    const res = await fetch(presignedUrl)
    if (!res.ok) return
    const blob = await res.blob()
    const file = new File([blob], fileName || "resume.pdf", { type: blob.type || "application/pdf" })
    const dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files
    input.dispatchEvent(new Event("change", { bubbles: true }))
  } catch {
    // Non-fatal: operator can attach resume manually
  }
}

/**
 * Wait for a selector to appear in the DOM (up to timeoutMs).
 */
function waitForElement(selector, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector)
    if (el) { resolve(el); return }
    const obs = new MutationObserver(() => {
      const found = document.querySelector(selector)
      if (found) { obs.disconnect(); resolve(found) }
    })
    obs.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => { obs.disconnect(); resolve(null) }, timeoutMs)
  })
}

/**
 * Show a status banner pinned to the top of the page.
 */
function showBanner(message, type = "info") {
  document.getElementById("pipeline-operator-banner")?.remove()
  const colors = {
    info:    "background:#1e3a5f;color:#bfdbfe;border-bottom:1px solid #3b82f6",
    success: "background:#052e16;color:#86efac;border-bottom:1px solid #22c55e",
    error:   "background:#450a0a;color:#fca5a5;border-bottom:1px solid #ef4444",
  }
  const el = document.createElement("div")
  el.id = "pipeline-operator-banner"
  el.setAttribute("style",
    `position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 16px;` +
    `font-size:13px;font-family:monospace;text-align:center;${colors[type] ?? colors.info}`
  )
  el.textContent = `⚙ Pipeline Operator: ${message}`
  document.body.prepend(el)
  if (type !== "error") setTimeout(() => el.remove(), 8000)
}

/**
 * Main fill routine.
 */
async function fillFormFromToken(token) {
  const payload = decodePayload(token)
  if (!payload?.snapshot) {
    showBanner("Invalid fill package — missing snapshot.", "error")
    return
  }

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && payload.exp < now) {
    showBanner("Fill package expired — regenerate from admin panel.", "error")
    return
  }

  const snap = payload.snapshot
  showBanner("Pre-filling form…", "info")

  // Wait for actual input fields to appear — not just <form>, which exists in the
  // SPA shell before React hydrates and renders the individual field inputs.
  await waitForElement(
    "input[name='first_name'], input[id='first_name'], input[type='email']",
    15000
  )

  // Brief extra delay to allow React to finish hydrating sibling fields.
  await new Promise((r) => setTimeout(r, 400))

  let filled = 0

  // First Name
  const firstNameField =
    findFieldByNameOrId(["first_name", "firstName"]) ??
    findFieldByLabel("first name")
  if (firstNameField && snap.firstName) {
    nativeSet(firstNameField, snap.firstName)
    filled++
  }

  // Last Name
  const lastNameField =
    findFieldByNameOrId(["last_name", "lastName"]) ??
    findFieldByLabel("last name")
  if (lastNameField && snap.lastName) {
    nativeSet(lastNameField, snap.lastName)
    filled++
  }

  // Email — use tracking email so Greenhouse confirmations route back to the app
  const emailField =
    findFieldByNameOrId(["email"]) ??
    findFieldByLabel("email") ??
    document.querySelector("input[type='email']")
  const emailValue = snap.trackingEmail ?? snap.email
  if (emailField instanceof HTMLInputElement && emailValue) {
    nativeSet(emailField, emailValue)
    filled++
  }

  // Phone
  const phoneField =
    findFieldByNameOrId(["phone"]) ??
    findFieldByLabel("phone")
  if (phoneField && snap.phone) {
    nativeSet(phoneField, snap.phone)
    filled++
  }

  // Location
  const locationField =
    findFieldByNameOrId(["job_application[location]", "location"]) ??
    findFieldByLabel("location") ??
    findFieldByLabel("city")
  if (locationField && snap.location) {
    nativeSet(locationField, snap.location)
    filled++
  }

  // Resume upload
  if (snap.presignedResumeUrl) {
    const resumeInput = document.querySelector("input[type='file']")
    if (resumeInput instanceof HTMLInputElement) {
      await attachResume(resumeInput, snap.presignedResumeUrl, snap.resumeFileName ?? "resume.pdf")
    }
  }

  // Custom question answers — use questionMeta for label/fieldName mapping
  if (Array.isArray(snap.questionMeta)) {
    for (const meta of snap.questionMeta) {
      const answer = snap.questionAnswers?.[meta.fieldName]
      if (!answer) continue

      if (meta.fieldType === "multi_value_single_select") {
        // Greenhouse renders selects for this type; find by name attribute
        const selectEl = document.querySelector(`select[name="${meta.fieldName}"]`)
        if (selectEl instanceof HTMLSelectElement) {
          const opt = Array.from(selectEl.options).find((o) => o.value === String(answer))
          if (opt) {
            selectEl.value = opt.value
            selectEl.dispatchEvent(new Event("change", { bubbles: true }))
            filled++
          }
        }
        continue
      }

      // text / textarea: try name-attribute selector first, fall back to label text
      let field = document.querySelector(
        `input[name="${meta.fieldName}"], textarea[name="${meta.fieldName}"]`
      )
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        field = findFieldByLabel(meta.label)
      }
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        nativeSet(field, answer)
        filled++
      }
    }
  }

  const unansweredPending = Array.isArray(snap.pendingQuestions)
    ? snap.pendingQuestions.filter((q) => !q.userAnswer && q.required)
    : []

  if (filled > 0) {
    const pendingMsg = unansweredPending.length > 0
      ? ` — ${unansweredPending.length} required field(s) need manual entry: ${unansweredPending.map((q) => q.label).join(", ")}`
      : ""
    showBanner(
      `Pre-filled ${filled} field${filled !== 1 ? "s" : ""}${pendingMsg} — review all fields, then submit manually.`,
      unansweredPending.length > 0 ? "info" : "success"
    )
  } else {
    showBanner(
      "Could not detect form fields — Greenhouse layout may have changed. Fill manually.",
      "error"
    )
  }
}
