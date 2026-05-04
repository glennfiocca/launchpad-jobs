import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  buildBreadcrumbListJsonLd,
  type BreadcrumbItem,
} from "@/lib/seo/breadcrumb-jsonld";
import { escapeJsonLd } from "@/lib/seo/json-ld-escape";

interface BreadcrumbsProps {
  items: ReadonlyArray<BreadcrumbItem>;
}

/**
 * Server Component breadcrumb trail with inline BreadcrumbList JSON-LD.
 *
 * The JSON-LD <script> is rendered alongside the visible nav so callers
 * don't need to plumb structured data through the page module — this keeps
 * the host page (e.g. /jobs/[publicJobId]/page.tsx) untouched and avoids
 * merge conflicts with parallel SEO work that adds other JSON-LD blocks.
 *
 * The last item is treated as the current page and rendered without a link.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  const jsonLd = buildBreadcrumbListJsonLd(items);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-zinc-400">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            return (
              <li
                key={`${item.label}-${idx}`}
                className="inline-flex items-center gap-x-1.5"
              >
                {idx > 0 && (
                  <ChevronRight
                    className="w-3 h-3 text-zinc-600 shrink-0"
                    aria-hidden
                  />
                )}
                {isLast || !item.href ? (
                  <span
                    className="text-zinc-300"
                    aria-current={isLast ? "page" : undefined}
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <script
        type="application/ld+json"
        // item.label can contain user-controlled content (e.g. a job title)
        // — escape `</script>` and friends to prevent script-tag breakout.
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(jsonLd) }}
      />
    </>
  );
}
