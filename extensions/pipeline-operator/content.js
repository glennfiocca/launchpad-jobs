/**
 * Pipeline Operator — content script
 *
 * Injected into https://job-boards.greenhouse.io/* pages.
 * Waits for a PIPELINE_FILL message containing a JWT, decodes the snapshot,
 * and pre-fills the Greenhouse application form.
 *
 * NOTE: Does NOT auto-submit. The operator reviews and clicks Submit manually.
 */

// Listen for token from background or admin page postMessage
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PIPELINE_FILL" && message.token) {
    fillFormFromToken(message.token);
  }
});

// Also accept postMessage from admin page (same-origin or with correct origin check)
window.addEventListener("message", (event) => {
  if (event.data?.type === "PIPELINE_FILL" && event.data?.token) {
    fillFormFromToken(event.data.token);
  }
});

// Poll background for a pending token (covers tab-open-then-fill race)
chrome.runtime.sendMessage({ type: "PIPELINE_POLL_TOKEN" }, (response) => {
  if (response?.token) fillFormFromToken(response.token);
});

/**
 * Decode JWT payload (no signature verification — server already validated before minting).
 * @param {string} token
 * @returns {object|null}
 */
function decodePayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Set a native input value in a way React-controlled components detect.
 * @param {HTMLInputElement|HTMLTextAreaElement} el
 * @param {string} value
 */
function nativeSet(el, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
    "value"
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Find a form field by label text (case-insensitive substring).
 * @param {string} labelText
 * @returns {HTMLInputElement|HTMLTextAreaElement|null}
 */
function findFieldByLabel(labelText) {
  const labels = document.querySelectorAll("label");
  for (const label of labels) {
    if (label.textContent?.toLowerCase().includes(labelText.toLowerCase())) {
      const forAttr = label.getAttribute("for");
      if (forAttr) {
        const el = document.getElementById(forAttr);
        if (el) return el;
      }
      // Check adjacent sibling or descendant
      const sibling = label.nextElementSibling;
      if (sibling instanceof HTMLInputElement || sibling instanceof HTMLTextAreaElement) return sibling;
      const child = label.querySelector("input, textarea");
      if (child instanceof HTMLInputElement || child instanceof HTMLTextAreaElement) return child;
    }
  }
  return null;
}

/**
 * Upload a resume file to a file input by fetching the presigned URL.
 * @param {HTMLInputElement} input
 * @param {string} presignedUrl
 * @param {string} fileName
 */
async function attachResume(input, presignedUrl, fileName) {
  try {
    const res = await fetch(presignedUrl);
    if (!res.ok) return;
    const blob = await res.blob();
    const file = new File([blob], fileName || "resume.pdf", { type: blob.type || "application/pdf" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  } catch {
    // Non-fatal: operator can attach resume manually
  }
}

/**
 * Main form-fill routine.
 * @param {string} token
 */
async function fillFormFromToken(token) {
  const payload = decodePayload(token);
  if (!payload?.snapshot) {
    showBanner("Pipeline: Invalid fill package token.", "error");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    showBanner("Pipeline: Fill package token has expired. Regenerate from admin panel.", "error");
    return;
  }

  const snap = payload.snapshot;
  showBanner("Pipeline: Pre-filling form…", "info");

  // Wait for form to be ready
  await waitForElement("form");

  // --- Standard Greenhouse fields ---
  const firstNameField = findFieldByLabel("first name");
  if (firstNameField) nativeSet(firstNameField, snap.firstName ?? "");

  const lastNameField = findFieldByLabel("last name");
  if (lastNameField) nativeSet(lastNameField, snap.lastName ?? "");

  const emailField = findFieldByLabel("email") ?? document.querySelector("input[type='email']");
  if (emailField instanceof HTMLInputElement) nativeSet(emailField, snap.trackingEmail ?? snap.email ?? "");

  const phoneField = findFieldByLabel("phone");
  if (phoneField && snap.phone) nativeSet(phoneField, snap.phone);

  const locationField = findFieldByLabel("location") ?? findFieldByLabel("city");
  if (locationField && snap.location) nativeSet(locationField, snap.location);

  // --- Resume upload ---
  if (snap.presignedResumeUrl) {
    const resumeInput = document.querySelector("input[type='file']");
    if (resumeInput instanceof HTMLInputElement) {
      await attachResume(resumeInput, snap.presignedResumeUrl, snap.resumeFileName ?? "resume.pdf");
    }
  }

  // --- Custom question answers ---
  if (snap.questionAnswers && typeof snap.questionAnswers === "object") {
    for (const [key, answer] of Object.entries(snap.questionAnswers)) {
      const field = findFieldByLabel(key);
      if (field && typeof answer === "string") nativeSet(field, answer);
    }
  }

  showBanner("Pipeline: Form pre-filled. Review and submit manually.", "success");
}

/**
 * Wait for a CSS selector to appear in the DOM (max 10s).
 * @param {string} selector
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) { resolve(el); return; }
    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) { observer.disconnect(); resolve(found); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
  });
}

/**
 * Show a small status banner at the top of the page.
 * @param {string} message
 * @param {"info"|"success"|"error"} type
 */
function showBanner(message, type) {
  const existing = document.getElementById("pipeline-operator-banner");
  if (existing) existing.remove();

  const colors = {
    info: "background:#1e40af;color:#bfdbfe",
    success: "background:#14532d;color:#86efac",
    error: "background:#7f1d1d;color:#fca5a5",
  };

  const banner = document.createElement("div");
  banner.id = "pipeline-operator-banner";
  banner.setAttribute(
    "style",
    `position:fixed;top:0;left:0;right:0;z-index:99999;padding:8px 16px;font-size:13px;font-family:monospace;text-align:center;${colors[type] ?? colors.info}`
  );
  banner.textContent = message;
  document.body.prepend(banner);

  if (type !== "error") {
    setTimeout(() => banner.remove(), 5000);
  }
}
