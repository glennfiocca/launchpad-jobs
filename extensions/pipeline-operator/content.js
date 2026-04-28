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
  // Check for token persisted from a navigation cascade (CTA click or embed redirect)
  chrome.storage.session.get(["pipelineFillToken", "pipelineFillExpiry"], (result) => {
    if (result.pipelineFillToken && result.pipelineFillExpiry > Date.now()) {
      chrome.storage.session.remove(["pipelineFillToken", "pipelineFillExpiry"])
      fillFormFromToken(result.pipelineFillToken)
      return
    }

    // Normal flow: request token from the admin tab that opened this page
    if (window.opener) {
      window.opener.postMessage({ type: "PIPELINE_REQUEST_TOKEN" }, "*")
    }
  })

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
 * Click an element via CDP (dispatched from background.js) so Greenhouse's
 * React event system sees a real pointer event rather than a synthetic one.
 * Falls back to element.click() if CDP is unavailable or the element is
 * outside the viewport.
 *
 * @param {Element} element
 * @returns {Promise<boolean>} true if CDP click succeeded
 */
async function cdpClick(element) {
  // Scroll element into view and wait for layout to settle
  element.scrollIntoView({ block: "center", behavior: "instant" })
  await new Promise(r => setTimeout(r, 80))

  const rect = element.getBoundingClientRect()
  const x = Math.round(rect.left + rect.width / 2)
  const y = Math.round(rect.top + rect.height / 2)

  // Validate coordinates are within viewport
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
    console.warn("[Pipeline] cdpClick: element out of viewport, falling back to DOM click", element)
    element.click()
    return false
  }

  try {
    const result = await chrome.runtime.sendMessage({ type: "CDP_CLICK", x, y })
    if (!result?.success) {
      console.warn("[Pipeline] cdpClick: CDP failed, falling back to DOM click", result?.error)
      element.click()
      return false
    }
    return true
  } catch (err) {
    console.warn("[Pipeline] cdpClick: sendMessage failed, falling back to DOM click", err)
    element.click()
    return false
  }
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
/**
 * Poll a condition function until it returns true or timeout expires.
 * @param {() => boolean} condition
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function waitForCondition(condition, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (condition()) { resolve(true); return; }
    const start = Date.now();
    const id = setInterval(() => {
      if (condition()) { clearInterval(id); resolve(true); return; }
      if (Date.now() - start >= timeoutMs) { clearInterval(id); resolve(false); }
    }, 100);
  });
}

async function fillReactSelect(fieldId, targetValue, selectValues) {
  // Strategy 1: wait for exact id match (up to 3 s for late-mounting sections)
  let input = await waitForElement(`#${fieldId}`, 3000)

  // Strategy 2: aria-labelledby fallback (react-select inputs are labelled by <label id="fieldId-label">)
  if (!(input instanceof HTMLInputElement)) {
    input = document.querySelector(`input[aria-labelledby="${fieldId}-label"]`)
  }

  // Strategy 3: find any input inside a field wrapper whose id starts with the numeric portion
  if (!(input instanceof HTMLInputElement)) {
    const numericId = fieldId.replace(/^question_/, '')
    input = document.querySelector(`input[id^="question_${numericId}"]`)
  }

  if (!(input instanceof HTMLInputElement)) {
    // Log candidates to help diagnose id mismatches
    const candidates = Array.from(document.querySelectorAll('input[id^="question_"]')).map(el => el.id)
    console.warn(`[pipeline-operator] fillReactSelect: input#${fieldId} not found. Candidates:`, candidates)
    return false
  }

  // Resolve label from selectValues map, fall back to raw value
  const strTarget = String(targetValue)
  const targetLabel = selectValues?.find((v) => String(v.value) === strTarget)?.label ?? strTarget

  // Walk up to the react-select control element
  const control = input.closest(".select__control") ?? input.parentElement?.closest("[class*='select']")
  if (!control) {
    console.warn(`[pipeline-operator] fillReactSelect: control not found for #${fieldId}`)
    return false
  }

  const openMenu = async () => {
    const toggleBtn = control.querySelector("button[aria-label='Toggle flyout']")
    await cdpClick(toggleBtn ?? control)
  }

  // Open and wait for aria-expanded — retry once if first attempt fails
  for (let attempt = 0; attempt < 2; attempt++) {
    await openMenu()
    const opened = await waitForCondition(() => input.getAttribute("aria-expanded") === "true", 5000)
    if (opened) break
    if (attempt === 1) {
      console.warn(`[pipeline-operator] fillReactSelect: dropdown did not open for #${fieldId}`)
      return false
    }
  }

  // Locate the menu: prefer aria-controls attr, then react-select id pattern, then visible .select__menu
  let menu = null
  const ariaControls = input.getAttribute("aria-controls")
  if (ariaControls) menu = document.getElementById(ariaControls)
  if (!menu) menu = document.getElementById(`react-select-${fieldId}-listbox`)
  if (!menu) {
    const allMenus = document.querySelectorAll(".select__menu, [role='listbox']")
    for (const m of allMenus) {
      if (m instanceof HTMLElement && m.offsetParent !== null) { menu = m; break; }
    }
  }
  if (!menu) {
    console.warn(`[pipeline-operator] fillReactSelect: menu element not found for #${fieldId}`)
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    return false
  }

  // Wait for options to render
  await waitForCondition(() => menu.querySelectorAll(".select__option, [role='option']").length > 0, 3000)

  const normalize = (s) => s.trim().replace(/\s+/g, " ").toLowerCase()
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  const normTarget = normalize(targetLabel)

  // Match by data-value exact, then text exact, then normalized text
  const options = menu.querySelectorAll(".select__option, [role='option']")
  let found = false
  for (const opt of options) {
    const optDataVal = opt.getAttribute("data-value") ?? ""
    const optText = normalize(opt.textContent ?? "")
    if (optDataVal === strTarget || optText === normTarget) {
      opt.scrollIntoView({ block: "nearest" })
      await new Promise(r => setTimeout(r, 40))
      await cdpClick(opt)
      found = true
      break
    }
  }
  // Last-resort: substring match only if EXACTLY ONE option matches (avoids "Yes"/"No" false positives)
  if (!found) {
    const subMatches = Array.from(options).filter((opt) => {
      const t = normalize(opt.textContent ?? "")
      return t.includes(normTarget) || normTarget.includes(t)
    })
    if (subMatches.length === 1) {
      subMatches[0].scrollIntoView({ block: "nearest" })
      await new Promise(r => setTimeout(r, 40))
      await cdpClick(subMatches[0])
      found = true
      console.warn(`[pipeline-operator] fillReactSelect: used unique-substring fallback for #${fieldId} label="${targetLabel}"`)
    }
  }

  if (!found) {
    console.warn(`[pipeline-operator] fillReactSelect: option not matched for #${fieldId} value="${strTarget}" label="${targetLabel}" options=${options.length}`)
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  }

  await new Promise((r) => setTimeout(r, 150))
  return found
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
 * Detect whether a fieldId maps to a checkbox group rather than a react-select.
 * Detection order (stops at first match):
 *  1. element is HTMLFieldSetElement
 *  2. element contains checkbox inputs with matching name
 *  3. name-based checkbox query returns results (no fieldset id match)
 */
function isCheckboxGroup(fieldId) {
  const el = document.getElementById(fieldId)
  if (el instanceof HTMLFieldSetElement) return true
  if (el) {
    const cbs = el.querySelectorAll(`input[type="checkbox"][name="${fieldId}"]`)
    if (cbs.length > 0) return true
  }
  // No element found by id — check by name attribute directly
  const byName = document.querySelectorAll(`input[type="checkbox"][name="${fieldId}"]`)
  return byName.length > 0
}

/**
 * Fill a checkbox group (fieldset with checkbox inputs) by checking matching value ids.
 * Used for Twilio-style multi_value_multi_select fields.
 *
 * @param {string} fieldId - id of the fieldset (e.g. "question_64795406[]")
 * @param {string[]} valueIds - array of option id strings to check
 * @returns {Promise<boolean>} true if at least one checkbox was checked
 */
async function fillCheckboxGroup(fieldId, valueIds) {
  // Locate the fieldset — getElementById works for ids containing "[]"
  const container = document.getElementById(fieldId)
    ?? document.querySelector(`fieldset[id="${fieldId}"]`)

  // Fall back to any checkbox group sharing the name attribute
  const checkboxes = container
    ? container.querySelectorAll(`input[type="checkbox"]`)
    : document.querySelectorAll(`input[type="checkbox"][name="${fieldId}"]`)

  if (!checkboxes.length) {
    console.warn(`[pipeline-operator] fillCheckboxGroup: no checkboxes found for fieldId=${fieldId}`)
    return false
  }

  let checked = 0
  for (const valueId of valueIds) {
    for (const cb of checkboxes) {
      if (cb.value === valueId && !cb.checked) {
        cb.scrollIntoView({ block: "nearest", behavior: "instant" })
        await new Promise(r => setTimeout(r, 40))
        // Use nativeInputValueSetter discipline for React-controlled checkboxes
        const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "checked"
        )?.set
        if (nativeCheckedSetter) {
          nativeCheckedSetter.call(cb, true)
        } else {
          cb.checked = true
        }
        cb.dispatchEvent(new Event("input",  { bubbles: true }))
        cb.dispatchEvent(new Event("change", { bubbles: true }))
        cb.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        checked++
        break
      }
    }
  }

  console.log(`[pipeline-operator] fillCheckboxGroup fieldId=${fieldId} checked ${checked}/${valueIds.length}`)
  return checked > 0
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
      for (const d of loaderValues) {
        if (!d || typeof d !== "object") continue
        // camelCase variant
        const camel = d.demographicQuestions
        if (camel) { demogQuestions = camel.questions ?? (Array.isArray(camel) ? camel : []); break; }
        // snake_case variant
        const snake = d.demographic_questions
        if (snake) { demogQuestions = snake.questions ?? (Array.isArray(snake) ? snake : []); break; }
        // nested under jobPost
        const nested = d.jobPost?.demographicQuestions ?? d.jobPost?.demographic_questions
        if (nested) { demogQuestions = nested.questions ?? (Array.isArray(nested) ? nested : []); break; }
      }
    }

    // Fallback: find embedded script tag with remix context JSON
    if (!demogQuestions.length) {
      const scriptEl =
        document.querySelector("script[data-remix-run-router]") ??
        document.querySelector("script#__remix-context__")
      if (scriptEl?.textContent) {
        const parsed = JSON.parse(scriptEl.textContent)
        const loaderVals = Object.values(parsed?.state?.loaderData ?? parsed?.loaderData ?? {})
        for (const d of loaderVals) {
          if (!d || typeof d !== "object") continue
          const qs = d.demographicQuestions?.questions ?? d.demographic_questions?.questions ??
            d.jobPost?.demographicQuestions?.questions ?? d.jobPost?.demographic_questions?.questions
          if (qs?.length) { demogQuestions = qs; break; }
        }
      }
    }
  } catch {
    // Non-fatal — demographics remain for operator to fill manually
  }

  if (!demogQuestions.length && Object.keys(eeoc).length > 0) {
    console.warn("[pipeline-operator] EEOC snapshot present but demographics not found in page context")
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
 * Wait for a selector to appear in the DOM (polling-based, up to timeoutMs).
 * Returns the element if found, null on timeout.
 * @param {string} selector
 * @param {number} timeoutMs
 * @returns {Promise<Element|null>}
 */
async function waitForElement(selector, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const el = document.querySelector(selector)
    if (el) return el
    await new Promise(r => setTimeout(r, 100))
  }
  return null
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
    `position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 44px 10px 16px;` +
    `font-size:13px;font-family:monospace;text-align:center;${colors[type] ?? colors.info}`
  )
  el.textContent = `⚙ Pipeline Operator: ${message}`

  // Dismiss button — manual X only, no auto-dismiss for non-errors
  const btn = document.createElement("button")
  btn.textContent = "✕"
  btn.setAttribute("style",
    "position:absolute;right:10px;top:50%;transform:translateY(-50%);" +
    "background:transparent;border:none;cursor:pointer;font-size:15px;padding:2px 6px;" +
    `color:${type === "error" ? "#fca5a5" : type === "success" ? "#86efac" : "#bfdbfe"}`
  )
  btn.onclick = () => el.remove()
  el.appendChild(btn)
  document.body.prepend(el)
  // No auto-dismiss — operator must click X
}

/**
 * Attempt to navigate from a detail page to the actual application form.
 * Tries clicking an Apply CTA first, then falls back to the embed URL.
 * Persists the fill token in session storage so the re-injected content
 * script on the new page can continue the fill.
 *
 * @param {string} token - The raw JWT string
 * @param {object} snap  - The decoded snapshot from the JWT payload
 * @returns {Promise<boolean>} true if a full-page navigation was triggered
 *   (caller should return — new content script instance will resume)
 */
async function tryFormNavigation(token, snap) {
  console.log("[Pipeline] Form not found — trying navigation cascade")

  // ── Attempt 1: Click an Apply CTA on the current page ─────────────────────
  // Check href-based selectors first (most reliable), then text-based
  const ctaByHref = document.querySelector(
    'a[href*="/embed/job_app"], a[href*="gh_jid="]'
  )
  if (ctaByHref) {
    console.log("[Pipeline] Found CTA link:", ctaByHref.getAttribute("href"))
    await chrome.storage.session.set({
      pipelineFillToken: token,
      pipelineFillExpiry: Date.now() + 120_000,
    })
    ctaByHref.click()
    // Allow time for SPA transition or navigation
    await new Promise((r) => setTimeout(r, 2000))
    // If we're still on this page (SPA transition), return false so caller re-checks form
    return false
  }

  // Text-based CTA search
  const allClickables = document.querySelectorAll("a, button")
  for (const el of allClickables) {
    const text = (el.textContent ?? "").trim().toLowerCase()
    if (
      text === "apply" ||
      text === "apply now" ||
      text === "apply for this job" ||
      text === "submit application"
    ) {
      console.log("[Pipeline] Found CTA button:", text)
      await chrome.storage.session.set({
        pipelineFillToken: token,
        pipelineFillExpiry: Date.now() + 120_000,
      })
      el.click()
      await new Promise((r) => setTimeout(r, 2000))
      return false
    }
  }

  // ── Attempt 2: Navigate directly to the embed URL ──────────────────────────
  if (snap.boardToken && snap.externalId) {
    const embedUrl =
      "https://job-boards.greenhouse.io/embed/job_app?for=" +
      encodeURIComponent(snap.boardToken) +
      "&token=" +
      encodeURIComponent(snap.externalId)

    // Avoid infinite redirect if we're already on the embed page
    if (window.location.href.includes("/embed/job_app")) {
      console.log("[Pipeline] Already on embed page — no further navigation")
      return false
    }

    console.log("[Pipeline] Navigating to embed URL:", embedUrl)
    await chrome.storage.session.set({
      pipelineFillToken: token,
      pipelineFillExpiry: Date.now() + 120_000,
    })
    window.location.href = embedUrl
    return true  // Full navigation — new content script will resume from storage
  }

  console.warn("[Pipeline] No boardToken/externalId in snapshot — cannot build embed URL")
  return false
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
  let formEl = await waitForElement(
    "input[name='first_name'], input[id='first_name'], input[type='email']",
    8000
  )

  // If form not found, try navigating to it (detail pages may not embed the form)
  if (!formEl) {
    const navigated = await tryFormNavigation(token, snap)
    if (navigated) return  // New page will pick up the token from session storage
    // Try one more time in case a CTA triggered a SPA transition
    formEl = await waitForElement(
      "input[name='first_name'], input[id='first_name'], input[type='email']",
      5000
    )
  }

  if (!formEl) {
    showBanner(
      "Could not detect form fields — fill manually or try refreshing.",
      "error"
    )
    return
  }

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
    // Belt-and-suspenders normalization for the most common abbreviations.
    // Server-side normalization is the primary layer; this catches anything that slips through.
    const COUNTRY_ABBR = {
      "us": "United States", "usa": "United States", "u.s.": "United States", "u.s.a.": "United States",
      "uk": "United Kingdom", "gb": "United Kingdom",
      "uae": "United Arab Emirates",
    }
    const rawCountry = snap.coreFieldExtras.country
    const country = COUNTRY_ABBR[rawCountry.toLowerCase().trim()] ?? rawCountry
    // Country is a react-select; pass label string directly as targetValue (no selectValues map)
    const ok = await fillReactSelect("country", country, null)
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

      // Scroll section into view so late-mounting fields are present in the DOM
      const fieldEl = document.getElementById(meta.fieldName)
      if (fieldEl) {
        fieldEl.scrollIntoView({ block: 'center', behavior: 'instant' })
        await new Promise(r => setTimeout(r, 80))
      }

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
        const ok = isCheckboxGroup(meta.fieldName)
          ? await fillCheckboxGroup(meta.fieldName, ids)
          : await fillReactMultiSelect(meta.fieldName, ids, meta.selectValues)
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

  // Remove Chrome debugging banner now that CDP clicks are done
  chrome.runtime.sendMessage({ type: "DEBUGGER_DETACH" }).catch(() => {})

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
