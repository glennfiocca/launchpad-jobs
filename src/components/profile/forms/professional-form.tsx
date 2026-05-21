"use client";

/**
 * ProfessionalForm — Direction A "Manifold" treatment.
 *
 * Mirrors the Personal tab reference implementation:
 *   - directionASectionClass cards with SectionHeader (eyebrow + title + right slot)
 *   - directionAInputClass on every input/textarea
 *   - SavedPill flashes in the topmost section header on a successful save
 *   - Single primaryWhiteBtnClass submit at the bottom (no per-field Save)
 *
 * Three sections (per Q1 redesign spec):
 *   1. Current Role — currentTitle, currentCompany, yearsExperience, headline, summary.
 *      (Spec also mentions `currentCompanyUrl` but no such column exists in the
 *      Prisma schema and the "no field add/remove" constraint forbids introducing
 *      one — omitted.)
 *   2. Application Templates — coverLetterIntro, whyImLookingTemplate (the spec
 *      refers to this as `whyLooking`; the DB column name is preserved).
 *   3. Professional Links — linkedinUrl, githubUrl, portfolioUrl. These are the
 *      three workhorse fields the autofill engine consumes on apply forms.
 *      (Twitter/X lives on the Personal tab per the global socials rubric.)
 *
 * Per-section completion contributors (Q1 lock, for tooltip context only — not
 * computed here): currentTitle, headline, summary, ≥1 of the URL fields, ≥1 of
 * the two template fields.
 *
 * Wiring contract preserved from the previous implementation:
 *   - blur-to-save not applicable (single submit per the Personal pattern)
 *   - IdentityRequiredNotice + isIdentityComplete gate the Save button so
 *     non-Personal tabs cannot 400 on missing firstName/lastName/email
 *   - buildPayload + getIdentityBase + submitProfilePatch flow unchanged
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import {
  directionAInputClass,
  directionASectionClass,
  gridThreeCol,
  gridTwoCol,
  labelClass,
  primaryWhiteBtnClass,
} from "./_shared/styles";
import {
  FormEyebrow,
  SavedPill,
  SectionHeader,
} from "./_shared/atoms";
import { IdentityRequiredNotice, isIdentityComplete } from "./_shared/identity-gate";
import { buildPayload, getIdentityBase, submitProfilePatch } from "./_shared/submit";

interface ProfessionalFormState {
  headline: string;
  summary: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  currentTitle: string;
  currentCompany: string;
  yearsExperience: string;
  // Application templates — referenced by the autofill engine when populating
  // optional cover-letter and "why are you looking" fields on ATS forms.
  coverLetterIntro: string;
  whyImLookingTemplate: string;
}

const TEMPLATE_MAX = 4000;

interface UrlFieldConfig {
  readonly key: "linkedinUrl" | "githubUrl" | "portfolioUrl";
  readonly label: string;
  readonly placeholder: string;
}

// The three autofill-workhorse URLs surfaced on the Professional tab. Twitter/X
// lives on the Personal tab per the global socials rubric (top-tier socials).
const PROFESSIONAL_LINKS: ReadonlyArray<UrlFieldConfig> = [
  {
    key: "linkedinUrl",
    label: "LinkedIn",
    placeholder: "https://linkedin.com/in/yourname",
  },
  {
    key: "githubUrl",
    label: "GitHub",
    placeholder: "https://github.com/yourname",
  },
  {
    key: "portfolioUrl",
    label: "Portfolio / Website",
    placeholder: "https://yoursite.com",
  },
];

function initState(data: UserProfile | null): ProfessionalFormState {
  return {
    headline: data?.headline ?? "",
    summary: data?.summary ?? "",
    linkedinUrl: data?.linkedinUrl ?? "",
    githubUrl: data?.githubUrl ?? "",
    portfolioUrl: data?.portfolioUrl ?? "",
    currentTitle: data?.currentTitle ?? "",
    currentCompany: data?.currentCompany ?? "",
    yearsExperience: data?.yearsExperience?.toString() ?? "",
    coverLetterIntro: data?.coverLetterIntro ?? "",
    whyImLookingTemplate: data?.whyImLookingTemplate ?? "",
  };
}

interface ProfessionalFormProps {
  initialData: UserProfile | null;
}

export function ProfessionalForm({ initialData }: ProfessionalFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<ProfessionalFormState>(initState(initialData));
  const [saving, setSaving] = useState(false);
  const [recentlySaved, setRecentlySaved] = useState(false);

  const set = (field: keyof ProfessionalFormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const slice = {
      headline: form.headline || undefined,
      summary: form.summary || undefined,
      linkedinUrl: form.linkedinUrl || undefined,
      githubUrl: form.githubUrl || undefined,
      portfolioUrl: form.portfolioUrl || undefined,
      currentTitle: form.currentTitle || undefined,
      currentCompany: form.currentCompany || undefined,
      yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
      // Empty string → null on the server so we don't store blank templates.
      coverLetterIntro: form.coverLetterIntro || null,
      whyImLookingTemplate: form.whyImLookingTemplate || null,
    };

    const payload = buildPayload(getIdentityBase(initialData), slice);
    const result = await submitProfilePatch(payload);
    if (!result.ok) {
      toast.error(result.error ?? "Failed to save profile");
    } else {
      toast.success("Profile saved");
      setRecentlySaved(true);
      // Match the 2-second SAVED pill window used by list-editor saves.
      setTimeout(() => setRecentlySaved(false), 2000);
      router.refresh();
    }
    setSaving(false);
  };

  const identityOk = isIdentityComplete(initialData);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <IdentityRequiredNotice initialData={initialData} />

      {/* Current Role — the "how you introduce yourself" section.
          SavedPill anchors here so the flash is visible at the top of the tab. */}
      <section className={directionASectionClass}>
        <SectionHeader
          eyebrow={
            <FormEyebrow accent>professional · how you introduce yourself</FormEyebrow>
          }
          title="Current Role"
          subtitle="Your headline and current-role snapshot. We use these to populate the top of every application."
          right={<SavedPill visible={recentlySaved} />}
        />

        <div>
          <label className={labelClass}>Headline</label>
          <input
            className={directionAInputClass}
            value={form.headline}
            onChange={(e) => set("headline", e.target.value)}
            placeholder="Senior Software Engineer at Acme Corp"
          />
        </div>

        <div className={gridTwoCol}>
          <div>
            <label className={labelClass}>Current Title</label>
            <input
              className={directionAInputClass}
              value={form.currentTitle}
              onChange={(e) => set("currentTitle", e.target.value)}
              placeholder="Software Engineer"
            />
          </div>
          <div>
            <label className={labelClass}>Current Company</label>
            <input
              className={directionAInputClass}
              value={form.currentCompany}
              onChange={(e) => set("currentCompany", e.target.value)}
              placeholder="Acme Corp"
            />
          </div>
        </div>

        <div className="max-w-[180px]">
          <label className={labelClass}>Years of Experience</label>
          <input
            className={`${directionAInputClass} font-mono tabular-nums`}
            type="number"
            min="0"
            max="50"
            value={form.yearsExperience}
            onChange={(e) => set("yearsExperience", e.target.value)}
            placeholder="5"
          />
        </div>

        {/* Hairline divider between identity-style fields and the long-form bio,
            mirroring the personal-form's intra-card subsection treatment. */}
        <div className="border-t border-white/[0.06] pt-4 mt-2">
          <FormEyebrow>bio · shown on profile + cover letters</FormEyebrow>
          <div className="mt-3">
            <label className={labelClass}>Bio / Summary</label>
            <textarea
              className={`${directionAInputClass} resize-y min-h-[110px]`}
              rows={4}
              value={form.summary}
              onChange={(e) => set("summary", e.target.value)}
              placeholder="Tell employers about yourself — what you build, what you care about."
            />
          </div>
        </div>
      </section>

      {/* Application Templates — pre-written blurbs that power autofill on ATS
          cover-letter and "why are you interested" fields. */}
      <section className={directionASectionClass}>
        <SectionHeader
          eyebrow={<FormEyebrow>autofilled into ATS forms</FormEyebrow>}
          title="Application Templates"
          subtitle="Pre-written blurbs the autofill engine drops into optional cover-letter and motivation fields on application forms."
        />

        <div>
          <div className="flex items-baseline justify-between mb-1">
            <label className={`${labelClass} mb-0`}>Cover Letter Intro</label>
            <span className="font-mono tabular-nums text-[10.5px] text-text-dim">
              {form.coverLetterIntro.length} / {TEMPLATE_MAX}
            </span>
          </div>
          <textarea
            className={`${directionAInputClass} resize-y min-h-[120px]`}
            rows={5}
            maxLength={TEMPLATE_MAX}
            value={form.coverLetterIntro}
            onChange={(e) => set("coverLetterIntro", e.target.value)}
            placeholder="Hi — I'm a software engineer with 5 years of experience…"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1">
            <label className={`${labelClass} mb-0`}>Why I&apos;m Looking</label>
            <span className="font-mono tabular-nums text-[10.5px] text-text-dim">
              {form.whyImLookingTemplate.length} / {TEMPLATE_MAX}
            </span>
          </div>
          <textarea
            className={`${directionAInputClass} resize-y min-h-[120px]`}
            rows={5}
            maxLength={TEMPLATE_MAX}
            value={form.whyImLookingTemplate}
            onChange={(e) => set("whyImLookingTemplate", e.target.value)}
            placeholder="I'm exploring roles where…"
          />
        </div>
      </section>

      {/* Professional Links — the three URLs the auto-apply pipeline reads.
          X/Twitter lives on the Personal tab per the global socials rubric. */}
      <section className={directionASectionClass}>
        <SectionHeader
          eyebrow={<FormEyebrow>autofill · workhorse links</FormEyebrow>}
          title="Professional Links"
          subtitle="LinkedIn, GitHub, and your portfolio are the three URLs the auto-apply pipeline reaches for on every application."
        />

        <div className={gridThreeCol}>
          {PROFESSIONAL_LINKS.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className={labelClass}>{label}</label>
              <input
                className={`${directionAInputClass} font-mono`}
                type="url"
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={saving || !identityOk}
          title={!identityOk ? "Complete the Personal tab first" : undefined}
          className={primaryWhiteBtnClass}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
