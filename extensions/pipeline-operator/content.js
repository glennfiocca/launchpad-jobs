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
 *
 * IMPORTANT: Greenhouse uses react-select for all dropdowns (no native <select>).
 * Fill pattern: click div.select__control → wait for menu → click matching option.
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
 * Find a field by known name or id attributes.
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
 * Fallback for text/textarea fields where id is unknown.
 */
function findFieldByLabel(labelText) {
  for (const label of document.querySelectorAll("label")) {
    if (!label.textContent?.toLowerCase().includes(labelText.toLowerCase())) continue

    const forAttr = label.getAttribute("for")
    if (forAttr) {
      const el = document.getElementById(forAttr)
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el
    }

    const child = label.querySelector("input, textarea")
    if (child instanceof HTMLInputElement || child instanceof HTMLTextAreaElement) return child

    const sibling = label.nextElementSibling
    if (sibling instanceof HTMLInputElement || sibling instanceof HTMLTextAreaElement) return sibling

    const parent = label.parentElement
    if (parent) {
      const parentChild = parent.querySelector("input, textarea")
      if (parentChild instanceof HTMLInputElement || parentChild instanceof HTMLTextAreaElement) return parentChild
    }
  }
  return null
}

/**
 * Fill a react-select combobox by fieldId.
 * Greenhouse react-select inputs have id="FIELD_ID" with class select__input inside div.select__control.
 *
 * @param {string} fieldId - The DOM input id (e.g. "country", "question_35943699002")
 * @param {string|number} targetValue - The option value (numeric id) or label string to match
 * @param {Array<{value: number|string, label: string}>|null} selectValues - Optional value→label map
 * @returns {Promise<boolean>} true if an option was clicked
 */
async function fillReactSelect(fieldId, targetValue, selectValues) {
  const input = document.getElementById(fieldId)
  if (!(input instanceof HTMLInputElement)) return false

  // Walk up to find div.select__control
  const control = input.closest(".select__control") ?? input.parentElement?.closest("[class*='select']")
  if (!control) return false

  // Open the dropdown
  const toggleBtn = control.querySelector("button[aria-label='Toggle flyout']")
  if (toggleBtn) {
    toggleBtn.click()
  } else {
    control.click()
  }
  await new Promise((r) => setTimeout(r, 400))

  // Locate the open menu
  const container = control.closest(".select__container") ?? control.parentElement
  const menu = container?.querySelector(".select__menu") ?? document.querySelector(".select__menu")
  if (!menu) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    return false
  }

  // Resolve target label from selectValues map, or use targetValue as-is
  const strTarget = String(targetValue)
  const targetLabel = selectValues?.find((v) => String(v.value) === strTarget)?.label ?? strTarget

  const options = menu.querySelectorAll(".select__option")
  for (const opt of options) {
    const text = opt.textContent?.trim() ?? ""
    if (
      text.toLowerCase() === targetLabel.toLowerCase() ||
      opt.getAttribute("data-value") === strTarget
    ) {
      opt.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      opt.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((r) => setTimeout(r, 150))
      return true
    }
  }

  // Close without selecting
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  return false
}

/**
 * Fill a react-select multi-select by clicking each target value sequentially.
 *
 * @param {string} fieldId
 * @param {string[]} valueIds - Array of numeric id strings to select
 * @param {Array<{value: number|string, label: string}>|null} selectValues
 * @returns {Promise<boolean>} true if at least one option was selected
 */
async function fillReactMultiSelect(fieldId, valueIds, selectValues) {
  let filled = 0
  for (const id of valueIds) {
    const ok = await fillReactSelect(fieldId, id, selectValues)
    if (ok) filled++
    await new Promise((r) => setTimeout(r, 200))
  }
  return filled > 0
}

/**
 * Fill EEOC demographic questions from the Remix page context.
 * Reads window.__remixContext or embedded <script> JSON to get demographic_questions.
 *
 * @param {{ gender?: string, race?: string, veteranStatus?: string, disability?: string }} eeoc
 */
async function fillDemographics(eeoc) {
  let demogQuestions = []

  try {
    // Try window.__remixContext (set by Remix on SPA pages)
    if (window.__remixContext?.state?.loaderData) {
      const loaderValues = Object.values(window.__remixContext.state.loaderData)
      const loaderWithDemog = loaderValues.find((d) => d?.demographicQuestions)
      demogQuestions = loaderWithDemog?.demographicQuestions?.questions ?? []
    }

    // Fallback: find embedded script tag with remix context JSON
    if (!demogQuestions.length) {
      const scriptEl =
        document.querySelector("script[data-remix-run-router]") ??
        document.querySelector("script#__remix-context__")
      if (scriptEl?.textContent) {
        const parsed = JSON.parse(scriptEl.textContent)
        demogQuestions =
          parsed?.state?.loaderData?.root?.demographicQuestions?.questions ??
          parsed?.loaderData?.root?.demographicQuestions?.questions ??
          []
      }
    }
  } catch {
    // Non-fatal — demographics remain for operator to fill manually
  }

  if (!demogQuestions.length) return

  const eeocMap = [
    { profileKey: "gender", pattern: /gender/i },
    { profileKey: "race", pattern: /race|ethnicity/i },
    { profileKey: "veteranStatus", pattern: /veteran/i },
    { profileKey: "disability", pattern: /disabilit/i },
  ]

  for (const { profileKey, pattern } of eeocMap) {
    const profileLabel = eeoc[profileKey]
    if (!profileLabel) continue

    const q = demogQuestions.find((dq) => pattern.test(dq.name ?? dq.question ?? ""))
    if (!q) continue

    const isMulti = q.answer_type?.key === "MULTI_SELECT"
    const matchedOpt = q.answer_options?.find(
      (opt) => opt.name.toLowerCase() === profileLabel.toLowerCase()
    )
    if (!matchedOpt) continue

    const fieldId = String(q.id)
    const syntheticSelectValues = (q.answer_options ?? []).map((o) => ({
      value: o.id,
      label: o.name,
    }))

    if (isMulti) {
      await fillReactMultiSelect(fieldId, [String(matchedOpt.id)], syntheticSelectValues)
    } else {
      await fillReactSelect(fieldId, String(matchedOpt.id), syntheticSelectValues)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
}

/**
 * Fetch resume from presigned URL via the background service worker (avoids CORS)
 * and attach to file input.
 */
async function attachResume(input, presignedUrl, fileName) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "FETCH_FILE", url: presignedUrl }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        resolve()
        return
      }
      try {
        const binary = atob(response.base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], { type: response.mimeType })
        const file = new File([blob], fileName || "resume.pdf", { type: response.mimeType })
        const dt = new DataTransfer()
        dt.items.add(file)
        input.files = dt.files
        input.dispatchEvent(new Event("change", { bubbles: true }))
      } catch {
        // Non-fatal: operator can attach resume manually
      }
      resolve()
    })
  })
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

  // Wait for actual input fields to appear (SPA hydration)
  await waitForElement(
    "input[name='first_name'], input[id='first_name'], input[type='email']",
    15000
  )
  await new Promise((r) => setTimeout(r, 400))

  let filled = 0
  const missingFields = []

  // ── Core fields ─────────────────────────────────────────────────────────────

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

  // ── coreFieldExtras ──────────────────────────────────────────────────────────

  if (snap.coreFieldExtras?.preferredFirstName) {
    const el =
      document.getElementById("preferred_name") ??
      findFieldByLabel("preferred")
    if (el instanceof HTMLInputElement) {
      nativeSet(el, snap.coreFieldExtras.preferredFirstName)
      filled++
    }
  }

  if (snap.coreFieldExtras?.country) {
    // Country is a react-select; pass label string directly as targetValue (no selectValues map)
    const ok = await fillReactSelect("country", snap.coreFieldExtras.country, null)
    if (ok) {
      filled++
    } else {
      missingFields.push("Country")
    }
  }

  // ── Resume upload ────────────────────────────────────────────────────────────
  if (snap.presignedResumeUrl) {
    const resumeInput = document.querySelector("input[type='file']")
    if (resumeInput instanceof HTMLInputElement) {
      await attachResume(resumeInput, snap.presignedResumeUrl, snap.resumeFileName ?? "resume.pdf")
    }
  }

  // ── Custom question answers (react-select + text/textarea) ───────────────────
  if (Array.isArray(snap.questionMeta)) {
    for (const meta of snap.questionMeta) {
      const answer = snap.questionAnswers?.[meta.fieldName]
      if (!answer) continue

      if (meta.fieldType === "multi_value_single_select") {
        const ok = await fillReactSelect(meta.fieldName, answer, meta.selectValues)
        if (ok) {
          filled++
        } else {
          missingFields.push(meta.label)
        }
        continue
      }

      if (meta.fieldType === "multi_value_multi_select") {
        const ids = String(answer).split(",").map((s) => s.trim()).filter(Boolean)
        const ok = await fillReactMultiSelect(meta.fieldName, ids, meta.selectValues)
        if (ok) {
          filled++
        } else {
          missingFields.push(meta.label)
        }
        continue
      }

      // text / textarea: try id selector first, fall back to label text
      let field = document.getElementById(meta.fieldName)
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        field = document.querySelector(
          `input[name="${meta.fieldName}"], textarea[name="${meta.fieldName}"]`
        )
      }
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        field = findFieldByLabel(meta.label)
      }
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        nativeSet(field, answer)
        filled++
      }
    }
  }

  // ── Demographics from Remix context ─────────────────────────────────────────
  if (snap.coreFieldExtras?.eeoc) {
    await fillDemographics(snap.coreFieldExtras.eeoc)
  }

  // ── Post-fill audit banner ───────────────────────────────────────────────────
  const unansweredPending = Array.isArray(snap.pendingQuestions)
    ? snap.pendingQuestions.filter((q) => !q.userAnswer && q.required)
    : []

  const allMissing = [
    ...missingFields,
    ...unansweredPending.map((q) => q.label),
  ]
  const uniqueMissing = [...new Set(allMissing)]

  if (filled > 0) {
    const pendingMsg = uniqueMissing.length > 0
      ? ` — ${uniqueMissing.length} required field(s) need manual entry: ${uniqueMissing.join(", ")}`
      : ""
    showBanner(
      `Pre-filled ${filled} field${filled !== 1 ? "s" : ""}${pendingMsg} — review all fields, then submit manually.`,
      uniqueMissing.length > 0 ? "info" : "success"
    )
  } else {
    showBanner(
      "Could not detect form fields — Greenhouse layout may have changed. Fill manually.",
      "error"
    )
  }
}
