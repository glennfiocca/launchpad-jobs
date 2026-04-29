/**
 * Pipeline Operator — content script
 *
 * Injected into https://job-boards.greenhouse.io/* and https://jobs.ashbyhq.com/* pages.
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
  console.log("[pipeline-operator] Content script loaded on:", window.location.href)

  // Priority 1: Token in URL hash (most reliable — set by admin page, no cross-origin dependency)
  const hashParams = new URLSearchParams(window.location.hash.slice(1))
  const hashToken = hashParams.get("pipelineFill")
  if (hashToken) {
    console.log("[pipeline-operator] Token found in URL hash, length:", hashToken.length)
    // Clean the token from the URL bar immediately
    window.history.replaceState(null, "", window.location.pathname + window.location.search)
    fillFormFromToken(hashToken)
    return
  }
  console.log("[pipeline-operator] No token in hash, checking session storage...")

  // Priority 2: Token persisted from a navigation cascade (CTA click or embed redirect)
  chrome.storage.session.get(["pipelineFillToken", "pipelineFillExpiry"], (result) => {
    if (result.pipelineFillToken && result.pipelineFillExpiry > Date.now()) {
      chrome.storage.session.remove(["pipelineFillToken", "pipelineFillExpiry"])
      fillFormFromToken(result.pipelineFillToken)
      return
    }

    // Priority 3: Request token from the admin tab via postMessage (legacy fallback)
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
  // CSS.escape handles special chars like [] in field IDs (e.g. "question_65934102[]")
  let input = await waitForElement(`#${CSS.escape(fieldId)}`, 3000)

  // Strategy 1b: if id matched a non-input element (container/div), find React-Select input inside it
  if (input && !(input instanceof HTMLInputElement)) {
    const inner = input.querySelector('input[role="combobox"], input.select__input, input[id*="select"]')
    if (inner instanceof HTMLInputElement) input = inner
  }

  // Strategy 2: aria-labelledby fallback (react-select inputs are labelled by <label id="fieldId-label">)
  if (!(input instanceof HTMLInputElement)) {
    input = document.querySelector(`input[aria-labelledby="${fieldId}-label"]`)
  }

  // Strategy 3: find any input inside a field wrapper whose id starts with the numeric portion
  if (!(input instanceof HTMLInputElement)) {
    const numericId = fieldId.replace(/^question_/, '')
    input = document.querySelector(`input[id^="question_${numericId}"]`)
  }

  // Strategy 4: find by input name attribute (EEOC fields use name="gender", "race", etc.)
  if (!(input instanceof HTMLInputElement)) {
    const named = document.querySelector(`input[name="${CSS.escape(fieldId)}"], select[name="${CSS.escape(fieldId)}"]`)
    if (named) {
      if (named instanceof HTMLInputElement) {
        input = named
      } else {
        // Found a <select> or hidden input — find the React-Select input in the same field wrapper
        const wrapper = named.closest('fieldset') ?? named.closest('[class*="field"]') ?? named.parentElement
        const rsInput = wrapper?.querySelector('input[role="combobox"], input.select__input')
        if (rsInput instanceof HTMLInputElement) input = rsInput
      }
    }
  }

  // Strategy 5: find label matching fieldId and locate React-Select input in same container
  if (!(input instanceof HTMLInputElement)) {
    for (const label of document.querySelectorAll('label')) {
      const lid = label.getAttribute('id') ?? ''
      if (lid === fieldId || lid === `${fieldId}-label` || lid === `${fieldId}_label`) {
        const wrapper = label.closest('fieldset') ?? label.closest('[class*="field"]') ?? label.parentElement
        const rsInput = wrapper?.querySelector('input[role="combobox"], input.select__input, input[id*="select"]')
        if (rsInput instanceof HTMLInputElement) { input = rsInput; break }
      }
    }
  }

  if (!(input instanceof HTMLInputElement)) {
    // Log candidates to help diagnose id mismatches
    const candidates = Array.from(document.querySelectorAll('input[role="combobox"], input[id^="question_"]')).map(el => el.id)
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
    // Skip if menu is already open (multi-select keeps menu open between selections)
    if (input.getAttribute("aria-expanded") === "true") return
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

// Decline-fallback helpers for EEOC demographics.
// Canonical source: src/lib/greenhouse/demographic-matcher.ts — keep in sync.
const DECLINE_PATTERNS = [
  "decline to self identify",
  "i dont wish to answer",
  "i do not wish to answer",
  "i do not want to answer",
  "choose not to answer",
  "prefer not to say",
  "prefer not to answer",
  "choose not to disclose",
  "decline to identify",
  "decline to state",
]

function normalizeDemogText(s) {
  return s.toLowerCase().trim()
    .replace(/[\u2018\u2019\u2032\u0060]/g, "'")
    .replace(/[-/]/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
}

function findDeclineOption(answerOptions) {
  const matches = answerOptions.filter((opt) =>
    DECLINE_PATTERNS.includes(normalizeDemogText(opt.name))
  )
  if (matches.length > 1) {
    console.warn(`[pipeline-operator] Ambiguous: ${matches.length} decline options found: ${matches.map((m) => m.name).join(", ")}`)
  }
  return matches.length === 1 ? matches[0] : null
}

/**
 * Find a React-Select input by searching for a label element containing the given text.
 * Walks up from the label to find the field container, then searches for the React-Select input.
 * @param {string} labelText
 * @returns {HTMLInputElement|null}
 */
function findReactSelectByLabelText(labelText) {
  const normalizedTarget = labelText.toLowerCase().trim()
  for (const label of document.querySelectorAll("label, legend, h3, .field-label")) {
    const text = (label.textContent ?? "").toLowerCase().trim()
    if (!text.includes(normalizedTarget) && !normalizedTarget.includes(text)) continue
    // Walk up to find the field container
    const wrapper =
      label.closest("fieldset") ??
      label.closest('[class*="field"]') ??
      label.closest('[class*="eeoc"]') ??
      label.parentElement
    if (!wrapper) continue
    const rsInput = wrapper.querySelector(
      'input[role="combobox"], input.select__input, input[class*="select__input"]'
    )
    if (rsInput instanceof HTMLInputElement) return rsInput
  }
  return null
}

/**
 * Fill a React-Select starting from a known input element (bypasses field-id lookup).
 * Mirrors fillReactSelect logic but skips the input-finding phase.
 * @param {HTMLInputElement} input
 * @param {string} targetValue
 * @param {string} targetLabel
 * @param {Array<{value: string|number, label: string}>|null} selectValues
 * @returns {Promise<boolean>}
 */
async function fillReactSelectFromInput(input, targetValue, targetLabel, selectValues) {
  const control = input.closest(".select__control") ?? input.parentElement?.closest("[class*='select']")
  if (!control) {
    console.warn("[pipeline-operator] fillReactSelectFromInput: control not found")
    return false
  }

  const openMenu = async () => {
    if (input.getAttribute("aria-expanded") === "true") return
    const toggleBtn = control.querySelector("button[aria-label='Toggle flyout']")
    await cdpClick(toggleBtn ?? control)
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    await openMenu()
    const opened = await waitForCondition(() => input.getAttribute("aria-expanded") === "true", 5000)
    if (opened) break
    if (attempt === 1) {
      console.warn("[pipeline-operator] fillReactSelectFromInput: dropdown did not open")
      return false
    }
  }

  let menu = null
  const ariaControls = input.getAttribute("aria-controls")
  if (ariaControls) menu = document.getElementById(ariaControls)
  if (!menu) {
    const allMenus = document.querySelectorAll(".select__menu, [role='listbox']")
    for (const m of allMenus) {
      if (m instanceof HTMLElement && m.offsetParent !== null) { menu = m; break }
    }
  }
  if (!menu) {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    return false
  }

  await waitForCondition(() => menu.querySelectorAll(".select__option, [role='option']").length > 0, 3000)

  const normalize = (s) => s.trim().replace(/\s+/g, " ").toLowerCase()
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  const strTarget = String(targetValue)
  const resolvedLabel = selectValues?.find((v) => String(v.value) === strTarget)?.label ?? targetLabel
  const normTarget = normalize(resolvedLabel)

  const options = menu.querySelectorAll(".select__option, [role='option']")
  let found = false
  for (const opt of options) {
    const optDataVal = opt.getAttribute("data-value") ?? ""
    const optText = normalize(opt.textContent ?? "")
    if (optDataVal === strTarget || optText === normTarget) {
      opt.scrollIntoView({ block: "nearest" })
      await new Promise((r) => setTimeout(r, 40))
      await cdpClick(opt)
      found = true
      break
    }
  }
  if (!found) {
    const subMatches = Array.from(options).filter((opt) => {
      const t = normalize(opt.textContent ?? "")
      return t.includes(normTarget) || normTarget.includes(t)
    })
    if (subMatches.length === 1) {
      subMatches[0].scrollIntoView({ block: "nearest" })
      await new Promise((r) => setTimeout(r, 40))
      await cdpClick(subMatches[0])
      found = true
    }
  }

  if (!found) {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  }
  await new Promise((r) => setTimeout(r, 150))
  return found
}

/**
 * Flatten Greenhouse eeoc_sections into the normalized shape expected by fillDemographics.
 * Input:  [{ questions: [{ label, fields: [{ name, type, values: [{ label, value }] }] }] }]
 * Output: [{ id: fieldName, name: questionLabel, answer_type, answer_options: [{ id, name }] }]
 */
function flattenEeocSections(sections) {
  const result = []
  for (const section of sections) {
    for (const question of section.questions ?? []) {
      for (const field of question.fields ?? []) {
        result.push({
          id: field.name,
          name: question.label,
          answer_type: { key: field.type === "multi_value_multi_select" ? "MULTI_SELECT" : "SINGLE_SELECT" },
          answer_options: (field.values ?? []).map((v) => ({ id: v.value, name: v.label })),
        })
      }
    }
  }
  return result
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
        // eeoc_sections: Greenhouse standard EEOC format (sections > questions > fields)
        const eeocSections = d.jobPost?.eeoc_sections ?? d.jobPost?.eeocSections
        if (eeocSections?.length) { demogQuestions = flattenEeocSections(eeocSections); break; }
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
          const eeocSec = d.jobPost?.eeoc_sections ?? d.jobPost?.eeocSections
          if (eeocSec?.length) { demogQuestions = flattenEeocSections(eeocSec); break; }
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

  // Scroll EEOC section into view so late-mounting React-Select components render
  const eeocSection = document.querySelector('[class*="eeoc"], [class*="demographic"], [data-section="eeoc"]')
    ?? document.querySelector('fieldset:last-of-type')
  if (eeocSection) {
    eeocSection.scrollIntoView({ block: "center", behavior: "instant" })
    await new Promise((r) => setTimeout(r, 300))
  }

  const eeocMap = [
    { profileKey: "gender", pattern: /gender/i },
    { profileKey: "race", pattern: /race|ethnicity/i },
    { profileKey: "veteranStatus", pattern: /veteran/i },
    { profileKey: "disability", pattern: /disabilit/i },
  ]

  for (const { profileKey, pattern } of eeocMap) {
    const profileLabel = eeoc[profileKey]

    const q = demogQuestions.find((dq) => pattern.test(dq.name ?? dq.question ?? ""))
    if (!q) continue

    const answerOptions = q.answer_options ?? []
    const isMulti = q.answer_type?.key === "MULTI_SELECT"

    // Tier 1: exact normalized match on profile value
    let matchedOpt = profileLabel
      ? answerOptions.find((opt) => normalizeDemogText(opt.name) === normalizeDemogText(profileLabel))
      : null
    let mode = matchedOpt ? "explicit_exact" : null

    // Tier 2: decline fallback
    if (!matchedOpt) {
      matchedOpt = findDeclineOption(answerOptions)
      mode = matchedOpt ? "decline_fallback" : "no_match"
    }

    if (!matchedOpt) {
      console.warn(`[pipeline-operator] EEOC ${profileKey}: no_match — no decline option found`)
      continue
    }

    console.log(`[pipeline-operator] EEOC ${profileKey}: mode=${mode} label="${matchedOpt.name}"`)

    const fieldId = String(q.id)
    const syntheticSelectValues = answerOptions.map((o) => ({
      value: o.id,
      label: o.name,
    }))

    let ok
    if (isMulti) {
      ok = await fillReactMultiSelect(fieldId, [String(matchedOpt.id)], syntheticSelectValues)
    } else {
      ok = await fillReactSelect(fieldId, String(matchedOpt.id), syntheticSelectValues)
    }

    // Last resort: find the React-Select by question label text (EEOC fields may lack standard IDs)
    if (!ok && q.name) {
      console.log(`[pipeline-operator] EEOC ${profileKey}: retrying via label text "${q.name}"`)
      const rsInput = findReactSelectByLabelText(q.name)
      if (rsInput) {
        ok = await fillReactSelectFromInput(rsInput, String(matchedOpt.id), matchedOpt.name, syntheticSelectValues)
      }
    }

    if (!ok) {
      console.warn(`[pipeline-operator] EEOC ${profileKey}: could not fill — field not found in DOM`)
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
    try {
      const el = document.querySelector(selector)
      if (el) return el
    } catch {
      // Invalid selector (e.g. unescaped special chars) — return null instead of throwing
      return null
    }
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
 * Detect which ATS provider the current page belongs to.
 * @returns {'greenhouse' | 'ashby' | null}
 */
function detectAtsProvider() {
  if (window.location.hostname === 'job-boards.greenhouse.io') return 'greenhouse'
  if (window.location.hostname === 'jobs.ashbyhq.com') return 'ashby'
  return null
}

/**
 * Fill an Ashby application form from the decoded snapshot.
 *
 * Ashby uses standard HTML inputs (not React-Select), and has a single "Name"
 * field instead of separate first/last. Submit is NOT automated.
 *
 * @param {object} snap - The decoded JWT snapshot
 * @param {string} token - The raw JWT string (for navigation fallback)
 */
async function fillAshbyForm(snap, token) {
  showBanner("Pre-filling Ashby form…", "info")
  console.log("[pipeline-operator] fillAshbyForm started, snapshot keys:", Object.keys(snap))

  // Ashby is a React SPA — inputs use name=<fieldPath> and id=<fieldPath>
  // System fields: _systemfield_name, _systemfield_email, _systemfield_location, _systemfield_resume
  // Non-system fields (phone, linkedin, etc.): UUID-based paths like "8039f8aa-..."
  // We use multiple strategies: name/id attribute selectors, then label-based fallback

  const ASHBY_FORM_SELECTORS = [
    'input[name="_systemfield_name"]',
    'input[id="_systemfield_name"]',
    'input[name="_systemfield_email"]',
    'input[id="_systemfield_email"]',
    'input[type="email"]',
    'input[type="tel"]',
  ].join(", ")

  // Wait for Ashby form fields to appear (SPA hydration — allow generous time)
  let formEl = await waitForElement(ASHBY_FORM_SELECTORS, 12000)
  console.log("[pipeline-operator] Initial form detection:", formEl ? formEl.tagName : "null")

  // If form not found, look for an Apply CTA
  if (!formEl) {
    const allClickables = document.querySelectorAll("a, button")
    for (const el of allClickables) {
      const text = (el.textContent ?? "").trim().toLowerCase()
      if (text === "apply" || text === "apply now" || text === "apply for this job") {
        console.log("[pipeline-operator] Clicking Apply CTA:", text)
        await chrome.storage.session.set({
          pipelineFillToken: token,
          pipelineFillExpiry: Date.now() + 120_000,
        })
        el.click()
        await new Promise((r) => setTimeout(r, 2000))
        formEl = await waitForElement(ASHBY_FORM_SELECTORS, 8000)
        break
      }
    }
  }

  if (!formEl) {
    // Last resort: look for ANY visible input on the page
    const anyInput = document.querySelector("input:not([type='hidden']):not([type='submit'])")
    if (anyInput) {
      console.log("[pipeline-operator] Found generic input as fallback:", anyInput.name, anyInput.id)
      formEl = anyInput
    }
  }

  if (!formEl) {
    showBanner("Could not detect Ashby form fields — fill manually or try refreshing.", "error")
    console.error("[pipeline-operator] No form fields found on page after all attempts")
    return
  }

  // Extra settle time for React to finish rendering all fields
  await new Promise((r) => setTimeout(r, 600))

  let filled = 0
  const missingFields = []

  // Build a lookup of questionMeta fieldName → label for UUID-keyed fields.
  // Used to find fields by their Ashby path attribute when label matching isn't enough.
  const metaByLabel = {}
  if (Array.isArray(snap.questionMeta)) {
    for (const m of snap.questionMeta) {
      metaByLabel[m.label.toLowerCase()] = m.fieldName
    }
  }

  /**
   * Find an Ashby input by: (1) name/id attribute, (2) UUID from questionMeta, (3) label text fallback.
   * Returns the first matching HTMLInputElement or HTMLTextAreaElement.
   */
  function findAshbyField(nameOrId, ...labelFallbacks) {
    // Try exact name or id match first
    if (nameOrId) {
      const byAttr =
        document.querySelector(`input[name="${nameOrId}"]`) ??
        document.querySelector(`input[id="${nameOrId}"]`) ??
        document.querySelector(`textarea[name="${nameOrId}"]`) ??
        document.querySelector(`textarea[id="${nameOrId}"]`)
      if (byAttr instanceof HTMLInputElement || byAttr instanceof HTMLTextAreaElement) return byAttr
    }

    // Try substring match on name (for _systemfield_ prefixed fields)
    if (nameOrId && nameOrId.startsWith("_systemfield_")) {
      const bySubstr = document.querySelector(`input[name*="${nameOrId}"], input[id*="${nameOrId}"]`)
      if (bySubstr instanceof HTMLInputElement) return bySubstr
    }

    // Try UUID from questionMeta: find the field path by matching label text
    for (const label of labelFallbacks) {
      const uuid = metaByLabel[label.toLowerCase()]
      if (uuid) {
        const byUuid =
          document.querySelector(`input[name="${uuid}"]`) ??
          document.querySelector(`input[id="${uuid}"]`) ??
          document.querySelector(`textarea[name="${uuid}"]`) ??
          document.querySelector(`textarea[id="${uuid}"]`)
        if (byUuid instanceof HTMLInputElement || byUuid instanceof HTMLTextAreaElement) {
          console.log(`[pipeline-operator] Found field by UUID for "${label}": ${uuid}`)
          return byUuid
        }
      }
    }

    // Fallback to label-based search
    for (const label of labelFallbacks) {
      const el = findFieldByLabel(label)
      if (el) return el
    }
    return null
  }

  // ── Core fields ─────────────────────────────────────────────────────────────

  // Name (Ashby uses a single combined "Full Name" field)
  const nameField = findAshbyField("_systemfield_name", "full name", "name")
  if (nameField instanceof HTMLInputElement && (snap.firstName || snap.lastName)) {
    const fullName = [snap.firstName, snap.lastName].filter(Boolean).join(" ")
    nativeSet(nameField, fullName)
    filled++
    console.log("[pipeline-operator] Filled: name")
  }

  // Email — use tracking email so confirmations route back to the app
  const emailField = findAshbyField("_systemfield_email", "email") ??
    document.querySelector('input[type="email"]')
  const emailValue = snap.trackingEmail ?? snap.email
  if (emailField instanceof HTMLInputElement && emailValue) {
    nativeSet(emailField, emailValue)
    filled++
    console.log("[pipeline-operator] Filled: email")
  }

  // Phone — Ashby uses a UUID path (not _systemfield_phone), so rely on label + type=tel
  const phoneField =
    document.querySelector('input[type="tel"]') ??
    findAshbyField(null, "phone", "phone number", "mobile")
  if (phoneField instanceof HTMLInputElement && snap.phone) {
    nativeSet(phoneField, snap.phone)
    filled++
    console.log("[pipeline-operator] Filled: phone")
  }

  // LinkedIn — try UUID from questionMeta first (most reliable), then label fallback.
  // Ashby LinkedIn uses a UUID path, not _systemfield_linkedin.
  const linkedinValue = snap.coreFieldExtras?.linkedIn
  const linkedinField = findAshbyField(null, "linkedin", "linkedin profile", "linkedin url")
  if (linkedinField instanceof HTMLInputElement && linkedinValue) {
    nativeSet(linkedinField, linkedinValue.trim())
    filled++
    console.log("[pipeline-operator] Filled: linkedin (core)")
  } else if (linkedinValue) {
    console.warn("[pipeline-operator] LinkedIn value exists but no field found via core path")
  }

  // GitHub — UUID path, label matching
  const githubField = findAshbyField(null, "github", "github profile", "github url")
  const githubValue = snap.coreFieldExtras?.github
  if (githubField instanceof HTMLInputElement && githubValue) {
    nativeSet(githubField, githubValue.trim())
    filled++
    console.log("[pipeline-operator] Filled: github")
  }

  // Website / Portfolio — UUID path, label matching
  const websiteField = findAshbyField(null, "website", "portfolio", "personal website", "portfolio url")
  const websiteValue = snap.coreFieldExtras?.website
  if (websiteField instanceof HTMLInputElement && websiteValue) {
    nativeSet(websiteField, websiteValue.trim())
    filled++
    console.log("[pipeline-operator] Filled: website")
  }

  // Location
  const locationField = findAshbyField("_systemfield_location", "location", "city", "where are you located")
  if (locationField instanceof HTMLInputElement && snap.location) {
    nativeSet(locationField, snap.location)
    filled++
    console.log("[pipeline-operator] Filled: location")
  }

  // ── Resume upload ────────────────────────────────────────────────────────────
  if (snap.presignedResumeUrl) {
    const resumeInput = document.querySelector("input[type='file']")
    if (resumeInput instanceof HTMLInputElement) {
      await attachResume(resumeInput, snap.presignedResumeUrl, snap.resumeFileName ?? "resume.pdf")
      filled++
      console.log("[pipeline-operator] Filled: resume")
    }
  }

  // ── FIX D: Re-assert tracking email after resume upload ─────────────────────
  // Ashby auto-parses resume metadata and may overwrite email with the personal
  // email found in the PDF, breaking the closed-loop tracking system.
  if (emailField instanceof HTMLInputElement && emailValue) {
    // Wait for Ashby's auto-parse to complete
    await new Promise((r) => setTimeout(r, 1500))
    const currentEmail = emailField.value
    if (currentEmail !== emailValue) {
      console.warn(`[pipeline-operator] Email was overwritten by resume parse: "${currentEmail}" → re-asserting "${emailValue}"`)
      nativeSet(emailField, emailValue)
      // Second check after React re-render
      await new Promise((r) => setTimeout(r, 300))
      if (emailField.value !== emailValue) {
        console.error("[pipeline-operator] Email re-assertion failed — tracking email may be lost")
      } else {
        console.log("[pipeline-operator] Email re-assertion succeeded")
      }
    } else {
      console.log("[pipeline-operator] Email unchanged after resume upload — tracking email preserved")
    }
  }

  // Track which questionMeta fields were already filled by core section
  // (e.g., LinkedIn might be filled above AND appear in questionMeta)
  const filledFieldNames = new Set()

  // ── Custom question answers ─────────────────────────────────────────────────
  // Ashby renders inputs with name=<fieldPath> and id=<fieldPath>.
  // ValueSelect uses custom dropdown (not native <select>).
  // Boolean uses checkbox or Yes/No toggle buttons.
  if (Array.isArray(snap.questionMeta)) {
    for (const meta of snap.questionMeta) {
      const answer = snap.questionAnswers?.[meta.fieldName]
      if (!answer) continue

      try {
        // Try to find by field name/id attributes (UUID paths)
        let field = document.querySelector(
          `input[name="${meta.fieldName}"], textarea[name="${meta.fieldName}"], select[name="${meta.fieldName}"], ` +
          `input[id="${meta.fieldName}"], textarea[id="${meta.fieldName}"], select[id="${meta.fieldName}"]`
        )

        // Fallback: search by label text
        if (!field) {
          field = findFieldByLabel(meta.label)
        }

        if (field instanceof HTMLSelectElement) {
          field.value = String(answer)
          field.dispatchEvent(new Event("change", { bubbles: true }))
          filled++
          filledFieldNames.add(meta.fieldName)
          console.log(`[pipeline-operator] Filled custom (select): ${meta.label}`)
        } else if (field instanceof HTMLInputElement && field.type === "checkbox") {
          // Ashby boolean checkbox — check/uncheck based on answer
          const shouldCheck = answer === "true" || answer === "yes" || answer === true
          if (field.checked !== shouldCheck) {
            field.click()
          }
          filled++
          filledFieldNames.add(meta.fieldName)
          console.log(`[pipeline-operator] Filled custom (checkbox): ${meta.label} = ${shouldCheck}`)
        } else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
          nativeSet(field, String(answer))
          filled++
          filledFieldNames.add(meta.fieldName)
          console.log(`[pipeline-operator] Filled custom (input): ${meta.label}`)
        } else {
          // No native element found — try Ashby-specific controls

          // FIX B: Boolean toggle buttons (Yes/No)
          const clickedToggle = tryClickAshbyToggle(meta.label, answer)
          if (clickedToggle) {
            filled++
            filledFieldNames.add(meta.fieldName)
            console.log(`[pipeline-operator] Filled custom (toggle): ${meta.label}`)
          }
          // FIX C: Ashby custom dropdown for ValueSelect (pronouns, etc.)
          else if (meta.fieldType === "multi_value_single_select" || meta.selectValues) {
            const clickedOption = tryClickAshbyDropdownOption(meta.fieldName, meta.label, answer, meta.selectValues)
            if (clickedOption) {
              filled++
              filledFieldNames.add(meta.fieldName)
              console.log(`[pipeline-operator] Filled custom (dropdown): ${meta.label}`)
            } else {
              console.warn(`[pipeline-operator] Could not find field for: ${meta.label} (path: ${meta.fieldName}, type: dropdown)`)
              missingFields.push(meta.label)
            }
          } else {
            console.warn(`[pipeline-operator] Could not find field for: ${meta.label} (path: ${meta.fieldName})`)
            missingFields.push(meta.label)
          }
        }
      } catch (err) {
        console.error(`[pipeline-operator] Error filling Ashby field "${meta.fieldName}":`, err)
        missingFields.push(meta.label)
      }
    }
  }

  // ── Pending questions — try toggle/boolean/dropdown fills ───────────────────
  // Questions that were unanswered at snapshot time but may have user answers
  // (e.g., boolean toggles auto-answered by question-matcher).
  if (Array.isArray(snap.pendingQuestions)) {
    for (const pq of snap.pendingQuestions) {
      if (!pq.userAnswer) continue
      if (filledFieldNames.has(pq.fieldName)) continue

      // Try checkbox first
      const checkbox = document.querySelector(
        `input[type="checkbox"][name="${pq.fieldName}"], input[type="checkbox"][id="${pq.fieldName}"]`
      )
      if (checkbox instanceof HTMLInputElement) {
        const shouldCheck = pq.userAnswer === "true" || pq.userAnswer === "yes"
        if (checkbox.checked !== shouldCheck) checkbox.click()
        filled++
        filledFieldNames.add(pq.fieldName)
        console.log(`[pipeline-operator] Filled pending (checkbox): ${pq.label}`)
        continue
      }

      // Try Yes/No toggle buttons
      const clickedToggle = tryClickAshbyToggle(pq.label, pq.userAnswer)
      if (clickedToggle) {
        filled++
        filledFieldNames.add(pq.fieldName)
        console.log(`[pipeline-operator] Filled pending (toggle): ${pq.label}`)
        continue
      }

      // Try dropdown for select-type pending questions
      if (pq.selectValues) {
        const clickedOption = tryClickAshbyDropdownOption(pq.fieldName, pq.label, pq.userAnswer, pq.selectValues)
        if (clickedOption) {
          filled++
          filledFieldNames.add(pq.fieldName)
          console.log(`[pipeline-operator] Filled pending (dropdown): ${pq.label}`)
        }
      }
    }
  }

  // ── Final email verification ────────────────────────────────────────────────
  // One last check: ensure tracking email survived all form interactions
  if (emailField instanceof HTMLInputElement && emailValue && emailField.value !== emailValue) {
    console.warn(`[pipeline-operator] Final email check: field has "${emailField.value}", expected "${emailValue}" — re-setting`)
    nativeSet(emailField, emailValue)
  }

  // ── Post-fill audit banner ───────────────────────────────────────────────────
  const unansweredPending = Array.isArray(snap.pendingQuestions)
    ? snap.pendingQuestions.filter((q) => !q.userAnswer && q.required && !filledFieldNames.has(q.fieldName))
    : []

  const allMissing = [
    ...missingFields,
    ...unansweredPending.map((q) => q.label),
  ]
  const uniqueMissing = [...new Set(allMissing)]

  console.log(`[pipeline-operator] Fill complete: ${filled} filled, ${uniqueMissing.length} missing`)

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
      "Could not pre-fill any fields — Ashby layout may have changed. Check browser console for diagnostics.",
      "error"
    )
  }
}

/**
 * Try to click an Ashby boolean toggle button matching the given label and answer.
 * Ashby renders boolean questions as two buttons ("Yes"/"No") or a single checkbox
 * inside a form field container. Walks up multiple DOM levels to find the question
 * boundary, then searches for clickable controls within.
 *
 * Returns true if a toggle was clicked.
 */
function tryClickAshbyToggle(labelText, answer) {
  const answerLower = String(answer).toLowerCase()
  // Determine which button text to look for
  const wantYes = answerLower === "true" || answerLower === "yes"
  const wantNo = answerLower === "false" || answerLower === "no"

  // Truncate label for substring matching (long policy texts)
  const matchText = labelText.toLowerCase().slice(0, 80)

  // Find the label/heading element for this question
  for (const labelEl of document.querySelectorAll("label, legend")) {
    const elText = labelEl.textContent?.toLowerCase() ?? ""
    if (!elText.includes(matchText)) continue

    // Walk up to the question container — Ashby nests label → div → div → buttons.
    // Walk up to 5 levels to find a container with buttons or checkboxes inside.
    let container = labelEl.parentElement
    for (let depth = 0; depth < 5 && container; depth++) {
      // Check for checkbox input first
      const checkbox = container.querySelector('input[type="checkbox"]')
      if (checkbox instanceof HTMLInputElement) {
        const shouldCheck = wantYes
        if (checkbox.checked !== shouldCheck) {
          checkbox.click()
        }
        console.log(`[pipeline-operator] tryClickAshbyToggle: clicked checkbox for "${labelText.slice(0, 50)}…"`)
        return true
      }

      // Check for Yes/No buttons
      const buttons = container.querySelectorAll("button")
      if (buttons.length >= 2) {
        for (const btn of buttons) {
          const btnText = (btn.textContent ?? "").trim().toLowerCase()
          if (
            (wantYes && btnText === "yes") ||
            (wantNo && btnText === "no") ||
            btnText === answerLower
          ) {
            btn.click()
            console.log(`[pipeline-operator] tryClickAshbyToggle: clicked "${btnText}" for "${labelText.slice(0, 50)}…"`)
            return true
          }
        }
      }

      container = container.parentElement
    }
  }
  return false
}

/**
 * Try to select an option in an Ashby custom dropdown (ValueSelect).
 * Ashby renders dropdowns as either:
 *   - Radio button groups (≤8 options)
 *   - Custom searchable dropdowns (>8 options)
 *
 * @param {string} fieldName - The UUID field path
 * @param {string} labelText - The question label text
 * @param {string} answer - The answer value to select
 * @param {Array} selectValues - Available options [{value, label}]
 * @returns {boolean} true if an option was selected
 */
function tryClickAshbyDropdownOption(fieldName, labelText, answer, selectValues) {
  const answerStr = String(answer)

  // Find the target option label from selectValues
  const targetOption = selectValues?.find((sv) => sv.value === answerStr)
  const targetLabel = targetOption?.label ?? answerStr

  console.log(`[pipeline-operator] tryClickAshbyDropdownOption: looking for "${targetLabel}" in "${labelText.slice(0, 50)}…"`)

  // Strategy 1: Find a radio/button group by field name attribute
  const radioInputs = document.querySelectorAll(
    `input[type="radio"][name="${fieldName}"], input[type="radio"][id*="${fieldName}"]`
  )
  if (radioInputs.length > 0) {
    for (const radio of radioInputs) {
      if (radio instanceof HTMLInputElement) {
        // Match by value or by associated label text
        if (radio.value === answerStr) {
          radio.click()
          return true
        }
        const radioLabel = radio.closest("label")?.textContent?.trim()
        if (radioLabel?.toLowerCase() === targetLabel.toLowerCase()) {
          radio.click()
          return true
        }
      }
    }
  }

  // Strategy 2: Find the question container by label text and look for clickable options
  const matchText = labelText.toLowerCase().slice(0, 60)
  for (const labelEl of document.querySelectorAll("label, legend")) {
    const elText = labelEl.textContent?.toLowerCase() ?? ""
    if (!elText.includes(matchText)) continue

    // Walk up to find the question container
    let container = labelEl.parentElement
    for (let depth = 0; depth < 5 && container; depth++) {
      // Look for radio buttons in this container
      const radios = container.querySelectorAll('input[type="radio"]')
      if (radios.length > 0) {
        for (const radio of radios) {
          if (!(radio instanceof HTMLInputElement)) continue
          const radioParent = radio.closest("label") ?? radio.parentElement
          const radioText = radioParent?.textContent?.trim()?.toLowerCase() ?? ""
          if (radio.value === answerStr || radioText === targetLabel.toLowerCase()) {
            radio.click()
            return true
          }
        }
      }

      // Look for option buttons/divs with matching text
      const optionEls = container.querySelectorAll("button, [role='option'], [role='radio']")
      for (const optEl of optionEls) {
        const optText = (optEl.textContent ?? "").trim()
        if (optText.toLowerCase() === targetLabel.toLowerCase()) {
          optEl.click()
          return true
        }
      }

      container = container.parentElement
    }
  }

  // Strategy 3: If Ashby uses a native <select> (fallback — less common)
  const selectEl = document.querySelector(`select[name="${fieldName}"], select[id="${fieldName}"]`)
  if (selectEl instanceof HTMLSelectElement) {
    selectEl.value = answerStr
    selectEl.dispatchEvent(new Event("change", { bubbles: true }))
    return true
  }

  return false
}

/**
 * Main fill routine — dispatches to ATS-specific handler.
 */
async function fillFormFromToken(token) {
  console.log("[pipeline-operator] fillFormFromToken called, token length:", token?.length)
  const payload = decodePayload(token)
  if (!payload?.snapshot) {
    console.error("[pipeline-operator] Invalid payload:", payload ? Object.keys(payload) : "null")
    showBanner("Invalid fill package — missing snapshot.", "error")
    return
  }

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && payload.exp < now) {
    console.error("[pipeline-operator] Token expired:", { exp: payload.exp, now })
    showBanner("Fill package expired — regenerate from admin panel.", "error")
    return
  }

  const snap = payload.snapshot
  console.log("[pipeline-operator] Snapshot loaded, keys:", Object.keys(snap))

  // Dispatch to ATS-specific handler if on Ashby
  const provider = detectAtsProvider()
  console.log("[pipeline-operator] Detected ATS provider:", provider)
  if (provider === 'ashby') {
    await fillAshbyForm(snap, token)
    return
  }

  // ── Greenhouse fill (default) ───────────────────────────────────────────────
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

      try {
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
      } catch (err) {
        // Isolate failures — one broken field must not block remaining fields
        console.error(`[pipeline-operator] Error filling field "${meta.fieldName}":`, err)
        missingFields.push(meta.label)
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
