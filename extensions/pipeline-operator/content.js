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
}

/**
 * Find a form field by label text (case-insensitive substring match).
 */
function findFieldByLabel(labelText) {
  for (const label of document.querySelectorAll("label")) {
    if (!label.textContent?.toLowerCase().includes(labelText.toLowerCase())) continue

    const forAttr = label.getAttribute("for")
    if (forAttr) {
      const el = document.getElementById(forAttr)
      if (el) return el
    }
    const sibling = label.nextElementSibling
    if (sibling instanceof HTMLInputElement || sibling instanceof HTMLTextAreaElement) return sibling
    const child = label.querySelector("input, textarea, select")
    if (child) return child
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
 * Wait for a selector to appear in the DOM (up to 10s).
 */
function waitForElement(selector, timeoutMs = 10000) {
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
  if (type !== "error") setTimeout(() => el.remove(), 6000)
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

  await waitForElement("form")

  // Standard Greenhouse fields
  const firstNameField = findFieldByLabel("first name")
  if (firstNameField) nativeSet(firstNameField, snap.firstName ?? "")

  const lastNameField = findFieldByLabel("last name")
  if (lastNameField) nativeSet(lastNameField, snap.lastName ?? "")

  // Use tracking email so Greenhouse confirmation routes back to the app
  const emailField = findFieldByLabel("email") ?? document.querySelector("input[type='email']")
  if (emailField instanceof HTMLInputElement) {
    nativeSet(emailField, snap.trackingEmail ?? snap.email ?? "")
  }

  const phoneField = findFieldByLabel("phone")
  if (phoneField && snap.phone) nativeSet(phoneField, snap.phone)

  const locationField = findFieldByLabel("location") ?? findFieldByLabel("city")
  if (locationField && snap.location) nativeSet(locationField, snap.location)

  // Resume upload
  if (snap.presignedResumeUrl) {
    const resumeInput = document.querySelector("input[type='file']")
    if (resumeInput instanceof HTMLInputElement) {
      await attachResume(resumeInput, snap.presignedResumeUrl, snap.resumeFileName ?? "resume.pdf")
    }
  }

  // Custom question answers
  if (snap.questionAnswers && typeof snap.questionAnswers === "object") {
    for (const [key, answer] of Object.entries(snap.questionAnswers)) {
      const field = findFieldByLabel(key)
      if (field && typeof answer === "string") nativeSet(field, answer)
    }
  }

  showBanner("Form pre-filled — review all fields, then submit manually.", "success")
}
