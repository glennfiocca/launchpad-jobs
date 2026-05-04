/**
 * Safely serialize a value for embedding inside <script type="application/ld+json">.
 *
 * `JSON.stringify` does NOT escape `</script>`, so any user-controlled
 * string in the LD payload (job title, description HTML, company name,
 * etc.) can break out of the script tag and execute arbitrary HTML.
 * Job descriptions from Greenhouse/Ashby frequently contain code samples
 * with literal `</script>` tags — this is a real-world XSS vector.
 *
 * Escape `<`, `>`, `&` to their `\uXXXX` form so the output is safe in any
 * HTML context. Also escape U+2028 / U+2029, which are valid inside JSON
 * strings but are illegal as raw line terminators in JavaScript source.
 *
 * The line-separator regexes are constructed via `String.fromCharCode` so
 * the source file contains no literal U+2028 / U+2029 chars — some parsers
 * (Vite's oxc) treat a literal U+2028 in a regex literal as a line break
 * and fail to parse it.
 */
const LINE_SEP_RE = new RegExp(String.fromCharCode(0x2028), "g");
const PARA_SEP_RE = new RegExp(String.fromCharCode(0x2029), "g");

export function escapeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEP_RE, "\\u2028")
    .replace(PARA_SEP_RE, "\\u2029");
}
