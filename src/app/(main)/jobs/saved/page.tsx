import { redirect } from "next/navigation";

/**
 * Legacy /jobs/saved route.
 *
 * Saved Jobs has been folded into the Browse Jobs page as a view toggle —
 * users now hit /jobs?saved=1 instead of a dedicated route. We keep this
 * file as a server-side redirect so existing bookmarks, in-flight email
 * links, and the sidebar entry from older deploys land in the right place
 * without producing a 404.
 *
 * The Next.js `redirect()` helper emits an HTTP 307 by default. That's the
 * right semantic here — these are permanent moves but we want the browser
 * to preserve the request method (GET) on follow.
 */
export default function SavedJobsRedirect(): never {
  redirect("/jobs?saved=1");
}
