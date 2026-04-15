/**
 * Greenhouse job HTML is injected with dangerouslySetInnerHTML. Some postings
 * include inline styles that create fixed overlays or nested scroll traps.
 * SSR-safe string processing only.
 */
function stripRiskyStyleFragments(style: string): string {
  return style
    .replace(/position\s*:\s*(fixed|sticky)\s*(?:!important)?\s*;?/gi, "")
    .replace(/pointer-events\s*:\s*none\s*(?:!important)?\s*;?/gi, "")
    .replace(/\s*;\s*;/g, ";")
    .trim()
    .replace(/^;|;$/g, "");
}

export function sanitizeEmployerJobHtml(html: string): string {
  if (!html) return html;

  let out = html.replace(/style\s*=\s*"([^"]*)"/gi, (_m, content: string) => {
    const s = stripRiskyStyleFragments(content);
    return s ? `style="${s}"` : "";
  });

  out = out.replace(/style\s*=\s*'([^']*)'/gi, (_m, content: string) => {
    const s = stripRiskyStyleFragments(content);
    return s ? `style='${s}'` : "";
  });

  return out;
}
