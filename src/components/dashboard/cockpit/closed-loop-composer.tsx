"use client";

/**
 * ClosedLoopComposer — Phase 3 of the editorial-cockpit redesign.
 *
 * Phase 3 Step 2 commit: stubbed footer. The full closed-loop send +
 * 5-second undo flow lands in Step 3.
 */

import type { ApplicationEmail } from "@prisma/client";

interface ClosedLoopComposerProps {
  applicationId: string;
  emails: ApplicationEmail[];
  disabled: boolean;
  modalOpen: boolean;
  onSent: (newEmail: ApplicationEmail) => void;
}

export function ClosedLoopComposer(_props: ClosedLoopComposerProps) {
  return (
    <div className="text-[12px] text-text-dim italic text-center py-2">
      Composer wiring lands in Phase 3 Step 3.
    </div>
  );
}
