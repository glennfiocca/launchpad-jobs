// Days a job posting remains valid in JobPosting structured data.
// Refreshed on every successful upstream sync. Lapses naturally when
// the source ATS stops listing a job (validThrough not refreshed).
export const VALIDITY_WINDOW_DAYS = 30;

// IndexNow / Bing-family search engine notification.
// Set INDEXNOW_KEY (UUID-shaped) in env to activate. The same value
// is the file content served at the keyLocation endpoint; rotate by
// generating a new UUID and updating env.
export const INDEXNOW_API_URL = "https://api.indexnow.org/indexnow";
export const INDEXNOW_BATCH_SIZE = 10000;
