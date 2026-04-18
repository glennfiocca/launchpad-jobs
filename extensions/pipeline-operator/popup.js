const statusEl = document.getElementById("status");

// Check if there's an active Greenhouse tab
chrome.tabs.query({ url: "https://job-boards.greenhouse.io/*" }, (tabs) => {
  if (tabs.length > 0) {
    statusEl.textContent = `Active on ${tabs.length} Greenhouse tab(s)`;
    statusEl.className = "ready";
  } else {
    statusEl.textContent = "No Greenhouse tab open";
    statusEl.className = "waiting";
  }
});
