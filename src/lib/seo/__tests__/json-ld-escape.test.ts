import { describe, it, expect } from "vitest";
import { escapeJsonLd } from "../json-ld-escape";

describe("escapeJsonLd", () => {
  it("escapes a literal </script> in a string value (the XSS vector)", () => {
    const out = escapeJsonLd({ payload: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("\\u003c");
    // Round-trips back to original via JSON.parse
    expect(JSON.parse(out)).toEqual({
      payload: "</script><script>alert(1)</script>",
    });
  });

  it("escapes < > & in any position", () => {
    const out = escapeJsonLd({ a: "<b>&amp;</b>" });
    expect(out).not.toMatch(/[<>&]/);
    expect(out).toContain("\\u003c");
    expect(out).toContain("\\u003e");
    expect(out).toContain("\\u0026");
  });

  it("preserves safe content unchanged after parse", () => {
    const value = { name: "Senior Engineer", years: 5, ok: true };
    expect(JSON.parse(escapeJsonLd(value))).toEqual(value);
  });

  it("escapes U+2028 and U+2029 line separators", () => {
    // U+2028 LINE SEPARATOR, U+2029 PARAGRAPH SEPARATOR
    const value = { ls: "a b", ps: "a b" };
    const out = escapeJsonLd(value);
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
    expect(JSON.parse(out)).toEqual(value);
  });

  it("handles a malicious job title (real-world breakout attempt)", () => {
    const evil = "Senior </script><img src=x onerror=alert(1)> Engineer";
    const out = escapeJsonLd({ title: evil });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<img");
    expect(JSON.parse(out).title).toBe(evil);
  });
});
