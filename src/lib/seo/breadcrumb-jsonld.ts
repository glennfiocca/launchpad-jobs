/**
 * Schema.org BreadcrumbList JSON-LD builder.
 *
 * Each breadcrumb item appears as a ListItem with a 1-indexed position.
 * `item` is required to be an absolute URL by Google. The final crumb (the
 * current page) typically has no `href`; we still emit it as the last
 * ListItem with the canonical absolute URL of the page itself if a base
 * URL has been provided. Items without an href and with no resolvable URL
 * are emitted with `name` only — Google accepts that for the trailing item.
 *
 * Reference: https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://trypipeline.ai";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbListItem {
  "@type": "ListItem";
  position: number;
  name: string;
  item?: string;
}

export interface BreadcrumbListSchema {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: BreadcrumbListItem[];
}

function toAbsoluteUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const path = href.startsWith("/") ? href : `/${href}`;
  return `${APP_URL}${path}`;
}

/**
 * Build a Schema.org BreadcrumbList for the given trail.
 * Items missing an href omit the `item` field — valid for the trailing crumb.
 */
export function buildBreadcrumbListJsonLd(
  items: ReadonlyArray<BreadcrumbItem>,
): BreadcrumbListSchema {
  const itemListElement: BreadcrumbListItem[] = items.map((crumb, idx) => {
    const entry: BreadcrumbListItem = {
      "@type": "ListItem",
      position: idx + 1,
      name: crumb.label,
    };
    if (crumb.href) {
      entry.item = toAbsoluteUrl(crumb.href);
    }
    return entry;
  });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  };
}
