/**
 * Pipeline Operator — background service worker (Manifest V3)
 *
 * Responsibilities:
 *  1. Listen for PIPELINE_FILL messages from the admin page (via chrome.runtime.sendMessage
 *     or from tabs via chrome.tabs.sendMessage).
 *  2. Relay the token to the appropriate Greenhouse tab's content script.
 *  3. Poll localStorage for tokens set by the admin page (fallback for popup-blocked flow).
 */

// Token store: applicationId → { token, tabId }
const pendingTokens = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PIPELINE_FILL") {
    const { token, tabId } = message;
    if (tabId) {
      // Relay directly to the target tab
      chrome.tabs.sendMessage(tabId, { type: "PIPELINE_FILL", token }, (response) => {
        sendResponse(response ?? { ok: true });
      });
      return true; // keep channel open for async response
    }
  }

  if (message.type === "PIPELINE_POLL_TOKEN") {
    // Content script asking: "do you have a token for me?"
    const entry = [...pendingTokens.values()].find((e) => e.tabId === sender.tab?.id);
    if (entry) {
      pendingTokens.delete(entry.applicationId);
      sendResponse({ token: entry.token });
    } else {
      sendResponse({ token: null });
    }
    return false;
  }
});

// Listen for tokens stored in localStorage by the admin page (cross-origin workaround)
chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.PIPELINE_FILL_TOKEN) {
    const raw = changes.PIPELINE_FILL_TOKEN.newValue;
    if (!raw) return;
    try {
      const { token, applicationId } = JSON.parse(raw);
      // Find the most recently focused Greenhouse tab and send the token
      chrome.tabs.query({ url: "https://job-boards.greenhouse.io/*", active: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: "PIPELINE_FILL", token });
          pendingTokens.set(applicationId, { token, tabId: tab.id, applicationId });
        } else {
          // Store for when the tab loads
          pendingTokens.set(applicationId, { token, tabId: null, applicationId });
        }
      });
      // Clear from storage after reading
      chrome.storage.local.remove("PIPELINE_FILL_TOKEN");
    } catch {
      // Ignore malformed entries
    }
  }
});

// When a new Greenhouse tab is activated, check for pending tokens
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.startsWith("https://job-boards.greenhouse.io/")) {
    // Check if there's a pending token without a tabId assigned
    for (const [appId, entry] of pendingTokens.entries()) {
      if (!entry.tabId) {
        entry.tabId = tabId;
        chrome.tabs.sendMessage(tabId, { type: "PIPELINE_FILL", token: entry.token });
        pendingTokens.delete(appId);
        break;
      }
    }
  }
});
