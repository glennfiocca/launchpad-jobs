"use client";

import { useRouter } from "next/navigation";
import type { UserProfile } from "@prisma/client";

/**
 * Identity-fields gate.
 *
 * The PUT /api/profile endpoint requires firstName, lastName, and email
 * (Zod-validated). Non-Personal tabs send those fields from the loaded
 * profile alongside their tab-specific data, so saves work as long as the
 * user already has a profile row with those identity fields filled.
 *
 * For brand-new users (or anyone whose identity fields are blank), saving
 * from a non-Personal tab would 400 with a confusing "field required"
 * error. This component:
 *   - returns true if identity is complete
 *   - returns false AND renders a notice (with a click-to-Personal-tab
 *     button) when identity is incomplete
 *
 * Usage in a tab form:
 *
 *   const identityOk = useIdentityGate(initialData);
 *   ...
 *   <IdentityRequiredNotice initialData={initialData} />
 *   ...
 *   <SaveButton saving={saving} disabled={!identityOk} />
 */

export function isIdentityComplete(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.firstName?.trim() &&
      profile.lastName?.trim() &&
      profile.email?.trim(),
  );
}

interface NoticeProps {
  initialData: UserProfile | null;
}

export function IdentityRequiredNotice({ initialData }: NoticeProps) {
  const router = useRouter();

  if (isIdentityComplete(initialData)) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
    >
      <span aria-hidden className="mt-[1px] text-amber-400">
        ⚠
      </span>
      <div className="flex-1">
        <p className="font-medium text-amber-200">
          Complete the Personal tab first
        </p>
        <p className="mt-0.5 text-amber-200/70">
          We need your name and email before changes on this tab can be saved.
          Fill those in on Personal, then come back here.
        </p>
      </div>
      <button
        type="button"
        onClick={() => router.replace("?tab=personal", { scroll: false })}
        className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/20 transition-colors"
      >
        Go to Personal →
      </button>
    </div>
  );
}
