/**
 * Pipeline Operator — background service worker (Manifest V3)
 *
 * Handles cross-origin file fetches that content scripts cannot make directly
 * due to CORS restrictions on the Greenhouse page context.
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
})
