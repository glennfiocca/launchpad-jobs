import { Suspense } from "react";
import { JobBoard } from "@/components/jobs/job-board";

export const dynamic = "force-dynamic";

/**
 * Browse Jobs entry point — container-scroll model (Linear / Gmail pattern).
 *
 * Desktop (`lg+`):
 *   - Page wrapper claims `100dvh - var(--navbar-h)` and is `flex flex-col`.
 *   - JobBoard owns two independently-scrollable panes (left list, right
 *     detail) inside that wrapper. The page itself does NOT scroll.
 *
 * Mobile (`<lg`):
 *   - Natural-document window-scroll (matches the dashboard pattern).
 *   - Filter shell stays sticky under the navbar; detail opens as a
 *     full-screen overlay.
 *
 * The footer is suppressed on this exact route — see footer.tsx.
 */
export default function JobsPage() {
  return (
    <div
      className={
        "max-w-[1480px] mx-auto px-7 pt-5 pb-6 " +
        // Container-scroll at lg+: fixed viewport height, flex column so
        // JobBoard's `flex-1 min-h-0` row can size the pane scrollers.
        "lg:h-[calc(100dvh-var(--navbar-h))] lg:pb-0 lg:flex lg:flex-col lg:overflow-hidden"
      }
    >
      <Suspense fallback={<div className="text-text-dim">Loading jobs...</div>}>
        <JobBoard />
      </Suspense>
    </div>
  );
}
