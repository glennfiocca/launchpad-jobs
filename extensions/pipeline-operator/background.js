/**
 * Pipeline Operator — background service worker (Manifest V3)
 *
 * Token delivery is handled by the window.opener postMessage handshake
 * between the admin page and content.js. This service worker is kept
 * minimal — it exists so the extension can declare host_permissions and
 * inject content.js into Greenhouse pages.
 *
 * If needed in the future, this is where you'd add chrome.tabs relay logic.
 */
