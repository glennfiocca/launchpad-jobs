/**
 * Pipeline Operator — background service worker (Manifest V3)
 *
 * Handles cross-origin file fetches that content scripts cannot make directly
 * due to CORS restrictions on the Greenhouse page context.
 *
 * Also provides CDP (Chrome DevTools Protocol) infrastructure for synthetic
 * mouse events via the debugger API, used as a fallback click strategy by
 * content.js when DOM click() is intercepted by the page's own listeners.
 */

// ---------------------------------------------------------------------------
// chrome.storage.session access for content scripts
// ---------------------------------------------------------------------------
// Default access is TRUSTED_CONTEXTS — extension pages only. Content scripts
// throw "Access to storage is not allowed from this context" on read/write.
// We use session storage to persist a fill token across same-tab navigations
// (e.g. Apply CTA opens the embedded application form). Open access on
// startup AND install so the API works on both fresh installs and extension
// reloads.
function openSessionStorage() {
  if (!chrome?.storage?.session?.setAccessLevel) return
  chrome.storage.session
    .setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })
    .catch((err) => {
      console.warn("[Pipeline] setAccessLevel failed:", err?.message ?? err)
    })
}
chrome.runtime.onInstalled.addListener(openSessionStorage)
chrome.runtime.onStartup.addListener(openSessionStorage)
// Service-worker cold-start: also call once at module load so an extension
// reload during dev opens access immediately.
openSessionStorage()

// ---------------------------------------------------------------------------
// Debugger lifecycle
// ---------------------------------------------------------------------------

/** Tracks tabs that have an active debugger session. */
const attachedTabs = new Map()

/**
 * Attach the Chrome debugger to `tabId` if not already attached.
 * If DevTools is open on the same tab, the attach will fail — we log and
 * continue; content.js will fall back to a plain DOM click.
 *
 * @param {number} tabId
 * @returns {Promise<void>}
 */
async function attachDebugger(tabId) {
  if (attachedTabs.has(tabId)) return
  try {
    await chrome.debugger.attach({ tabId }, "1.3")
    attachedTabs.set(tabId, true)
  } catch (err) {
    // Another debugger may already be attached (DevTools open) — log and continue
    // cdpClick in content.js will fall back to DOM click if commands fail
    console.warn("[Pipeline] debugger attach failed for tab", tabId, /** @type {Error} */ (err).message)
  }
}

/**
 * Detach the Chrome debugger from `tabId` if we own the session.
 *
 * @param {number} tabId
 * @returns {Promise<void>}
 */
async function detachDebugger(tabId) {
  if (!attachedTabs.has(tabId)) return
  try {
    await chrome.debugger.detach({ tabId })
  } catch {
    // Tab may already be closed
  } finally {
    attachedTabs.delete(tabId)
  }
}

// Clean up state if the debugger is detached externally (e.g. DevTools opened).
chrome.debugger.onDetach.addListener((source) => {
  attachedTabs.delete(source.tabId)
})

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ------------------------------------------------------------------
  // FETCH_FILE — cross-origin file fetch (original handler, unchanged)
  // ------------------------------------------------------------------
  if (message.type === "FETCH_FILE" && typeof message.url === "string") {
    fetch(message.url)
      .then(async (res) => {
        if (!res.ok) {
          sendResponse({ success: false, status: res.status })
          return
        }
        const buffer = await res.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ""
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = btoa(binary)
        const mimeType = res.headers.get("content-type") ?? "application/octet-stream"
        sendResponse({ success: true, base64, mimeType })
      })
      .catch((err) => {
        sendResponse({ success: false, error: String(err) })
      })
    return true // keep message channel open for async response
  }

  // ------------------------------------------------------------------
  // CDP_CLICK — synthetic mouse press/release via Chrome debugger API
  // ------------------------------------------------------------------
  if (message.type === "CDP_CLICK") {
    const tabId = sender.tab?.id

    if (tabId === undefined) {
      sendResponse({ success: false, error: "No tab context" })
      return true
    }

    const x = /** @type {number} */ (message.x)
    const y = /** @type {number} */ (message.y)

    const click = async () => {
      await attachDebugger(tabId)

      /** @type {chrome.debugger.Debuggee} */
      const debuggee = { tabId }

      /** @type {Record<string, unknown>} */
      const baseParams = {
        x,
        y,
        button: "left",
        buttons: 1,
        clickCount: 1,
        pointerType: "mouse",
      }

      await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
        ...baseParams,
        type: "mousePressed",
      })

      await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
        ...baseParams,
        type: "mouseReleased",
      })
    }

    const timeout = new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error("CDP_CLICK timed out after 5s")), 5000)
    )

    Promise.race([click(), timeout])
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: String(err) }))

    return true // keep message channel open for async response
  }

  // ------------------------------------------------------------------
  // DEBUGGER_DETACH — release the debugger session for the calling tab
  // ------------------------------------------------------------------
  if (message.type === "DEBUGGER_DETACH") {
    const tabId = sender.tab?.id

    if (tabId === undefined) {
      sendResponse({ success: false, error: "No tab context" })
      return true
    }

    detachDebugger(tabId).then(() => sendResponse({ success: true }))

    return true // keep message channel open for async response
  }
})
