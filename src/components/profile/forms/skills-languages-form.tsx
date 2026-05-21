"use client";

/**
 * SkillsLanguagesForm — thin layout wrapper.
 *
 * Skills span-3 (~60%) | Languages span-2 (~40%) on desktop (lg:grid-cols-5).
 * Mobile: stacked. All logic lives in the sub-modules below.
 *
 * See skills-tier-grid.tsx and languages-section.tsx for implementation.
 */

import type { UserProfile } from "@prisma/client";
import { IdentityRequiredNotice, isIdentityComplete } from "./_shared/identity-gate";
import { SkillsSection } from "./skills-tier-grid";
import { LanguagesSection } from "./languages-section";

interface Props {
  initialData: UserProfile | null;
}

export function SkillsLanguagesForm({ initialData }: Props) {
  const identityOk = isIdentityComplete(initialData);

  return (
    <div className="space-y-6">
      <IdentityRequiredNotice initialData={initialData} />
      {/* Desktop: 5-col grid → Skills span-3 (~60%) | Languages span-2 (~40%).
          Mobile: stack. The intra-column hairline between sections is
          realized through each card's own border + gap-6. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <SkillsSection identityOk={identityOk} />
        </div>
        <div className="lg:col-span-2">
          <LanguagesSection identityOk={identityOk} />
        </div>
      </div>
    </div>
  );
}
