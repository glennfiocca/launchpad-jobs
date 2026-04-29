const statusEl = document.getElementById("status");

// Check if there's an active Greenhouse or Ashby tab
chrome.tabs.query({ url: ["https://job-boards.greenhouse.io/*", "https://jobs.ashbyhq.com/*"] }, (tabs) => {
  if (tabs.length > 0) {
    const ghCount = tabs.filter((t) => t.url?.includes("greenhouse.io")).length;
    const ashbyCount = tabs.filter((t) => t.url?.includes("ashbyhq.com")).length;
    const parts = [];
    if (ghCount > 0) parts.push(`${ghCount} Greenhouse`);
    if (ashbyCount > 0) parts.push(`${ashbyCount} Ashby`);
    statusEl.textContent = `Active on ${parts.join(", ")} tab(s)`;
    statusEl.className = "ready";
  } else {
    statusEl.textContent = "No ATS tab open";
    statusEl.className = "waiting";
  }
});
