"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import { inputClass, labelClass, sectionClass, sectionTitleClass } from "./_shared/styles";
import { SaveButton } from "./_shared/save-button";
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
}

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
  };
}

interface ProfessionalFormProps {
  initialData: UserProfile | null;
}

export function ProfessionalForm({ initialData }: ProfessionalFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<ProfessionalFormState>(initState(initialData));
  const [saving, setSaving] = useState(false);

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
    };

    const payload = buildPayload(getIdentityBase(initialData), slice);
    const result = await submitProfilePatch(payload);
    if (!result.ok) {
      toast.error(result.error ?? "Failed to save profile");
    } else {
      toast.success("Profile saved successfully!");
      router.refresh();
    }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <IdentityRequiredNotice initialData={initialData} />
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Professional Summary</h2>
        <div>
          <label className={labelClass}>Headline</label>
          <input
            className={inputClass}
            value={form.headline}
            onChange={(e) => set("headline", e.target.value)}
            placeholder="Senior Software Engineer at Acme Corp"
          />
        </div>
        <div>
          <label className={labelClass}>Current Title</label>
          <input
            className={inputClass}
            value={form.currentTitle}
            onChange={(e) => set("currentTitle", e.target.value)}
            placeholder="Software Engineer"
          />
        </div>
        <div>
          <label className={labelClass}>Current Company</label>
          <input
            className={inputClass}
            value={form.currentCompany}
            onChange={(e) => set("currentCompany", e.target.value)}
            placeholder="Acme Corp"
          />
        </div>
        <div>
          <label className={labelClass}>Years of Experience</label>
          <input
            className={inputClass}
            type="number"
            min="0"
            max="50"
            value={form.yearsExperience}
            onChange={(e) => set("yearsExperience", e.target.value)}
            placeholder="5"
          />
        </div>
        <div>
          <label className={labelClass}>Bio / Summary</label>
          <textarea
            className={`${inputClass} resize-none`}
            rows={4}
            value={form.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="Tell employers about yourself..."
          />
        </div>
      </div>

      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Professional Links</h2>
        <div>
          <label className={labelClass}>LinkedIn URL</label>
          <input
            className={inputClass}
            type="url"
            value={form.linkedinUrl}
            onChange={(e) => set("linkedinUrl", e.target.value)}
            placeholder="https://linkedin.com/in/yourname"
          />
        </div>
        <div>
          <label className={labelClass}>GitHub URL</label>
          <input
            className={inputClass}
            type="url"
            value={form.githubUrl}
            onChange={(e) => set("githubUrl", e.target.value)}
            placeholder="https://github.com/yourname"
          />
        </div>
        <div>
          <label className={labelClass}>Portfolio / Website</label>
          <input
            className={inputClass}
            type="url"
            value={form.portfolioUrl}
            onChange={(e) => set("portfolioUrl", e.target.value)}
            placeholder="https://yoursite.com"
          />
        </div>
      </div>

      <SaveButton
        saving={saving}
        disabled={!isIdentityComplete(initialData)}
        disabledReason="Complete the Personal tab first"
      />
    </form>
  );
}
