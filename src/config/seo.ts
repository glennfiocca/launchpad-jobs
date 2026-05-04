// Days a job posting remains valid in JobPosting structured data.
// Refreshed on every successful upstream sync. Lapses naturally when
// the source ATS stops listing a job (validThrough not refreshed).
export const VALIDITY_WINDOW_DAYS = 30;
