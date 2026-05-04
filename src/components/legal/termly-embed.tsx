"use client";

// Termly Code-Snippet embed.
//
// Termly's loader (https://app.termly.io/embed-policy.min.js) scans the
// document for placeholders matching `[name="termly-embed"]` and replaces
// them with the live legal document content. The `name` attribute is
// non-standard on a <div>, which React's TypeScript types refuse — so we
// inject the placeholder via dangerouslySetInnerHTML. The HTML string is
// constructed from constants in this repo (the document ID is hardcoded
// in the page calling this component); no user input ever reaches it.
//
// The Termly loader script itself is loaded once per page via next/script
// with id="termly-jssdk" so Next.js dedupes it across navigations.

import Script from "next/script";

interface TermlyEmbedProps {
  documentId: string;
}

// Defensive guard: only allow UUIDs through to the placeholder. Document IDs
// are hardcoded in the calling pages, so a mismatch here means a typo at
// authoring time, not a runtime attack vector.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function TermlyEmbed({ documentId }: TermlyEmbedProps) {
  if (!UUID_PATTERN.test(documentId)) {
    return null;
  }
  const placeholder = `<div name="termly-embed" data-id="${documentId}"></div>`;
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: placeholder }} />
      <Script
        id="termly-jssdk"
        src="https://app.termly.io/embed-policy.min.js"
        strategy="afterInteractive"
      />
    </>
  );
}
