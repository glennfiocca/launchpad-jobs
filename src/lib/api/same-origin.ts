// Same-origin CSRF check shared across state-changing API routes.
//
// Browser-initiated cross-origin requests always send Origin. Same-origin
// form posts may omit Origin, in which case we fall back to a Referer host
// check. If neither header is present we refuse rather than guess — for
// state-changing endpoints that's the only safe default.

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!host) return false;

  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    // No Origin and no Referer — only safe for non-browser clients.
    // For state-changing endpoints, refuse rather than guess.
    return false;
  }
  try {
    return new URL(referer).host === host;
  } catch {
    return false;
  }
}
