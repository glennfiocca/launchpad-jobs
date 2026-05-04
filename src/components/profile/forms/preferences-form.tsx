"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import { inputClass, labelClass, sectionClass, sectionTitleClass } from "./_shared/styles";
import { SaveButton } from "./_shared/save-button";
import { IdentityRequiredNotice, isIdentityComplete } from "./_shared/identity-gate";
import { buildPayload, getIdentityBase, submitProfilePatch } from "./_shared/submit";

interface PreferencesFormState {
  desiredSalaryMin: string;
  desiredSalaryMax: string;
  openToRemote: boolean;
  openToHybrid: boolean;
  openToOnsite: boolean;
  workAuthorization: string;
  requiresSponsorship: boolean;
}

function initState(data: UserProfile | null): PreferencesFormState {
  return {
    desiredSalaryMin: data?.desiredSalaryMin?.toString() ?? "",
    desiredSalaryMax: data?.desiredSalaryMax?.toString() ?? "",
    openToRemote: data?.openToRemote ?? true,
    openToHybrid: data?.openToHybrid ?? true,
    openToOnsite: data?.openToOnsite ?? false,
    workAuthorization: data?.workAuthorization ?? "",
    requiresSponsorship: data?.requiresSponsorship ?? false,
  };
}

interface PreferencesFormProps {
  initialData: UserProfile | null;
}

export function PreferencesForm({ initialData }: PreferencesFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<PreferencesFormState>(initState(initialData));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof PreferencesFormState>(field: K, value: PreferencesFormState[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const slice = {
      desiredSalaryMin: form.desiredSalaryMin ? Number(form.desiredSalaryMin) : undefined,
      desiredSalaryMax: form.desiredSalaryMax ? Number(form.desiredSalaryMax) : undefined,
      openToRemote: form.openToRemote,
      openToHybrid: form.openToHybrid,
      openToOnsite: form.openToOnsite,
      workAuthorization: form.workAuthorization || undefined,
      requiresSponsorship: form.requiresSponsorship,
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

  const workModes = [
    { key: "openToRemote" as const, label: "Remote" },
    { key: "openToHybrid" as const, label: "Hybrid" },
    { key: "openToOnsite" as const, label: "Onsite" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <IdentityRequiredNotice initialData={initialData} />
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Salary Expectations</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Minimum (USD/year)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">
                $
              </span>
              <input
                className={`${inputClass} pl-7`}
                type="number"
                min="0"
                value={form.desiredSalaryMin}
                onChange={(e) => set("desiredSalaryMin", e.target.value)}
                placeholder="120000"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Maximum (USD/year)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">
                $
              </span>
              <input
                className={`${inputClass} pl-7`}
                type="number"
                min="0"
                value={form.desiredSalaryMax}
                onChange={(e) => set("desiredSalaryMax", e.target.value)}
                placeholder="160000"
              />
            </div>
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Work Preferences</h2>
        <div className="flex gap-3">
          {workModes.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => set(key, !form[key])}
              className={`rounded-lg px-3 py-2 text-sm border transition-colors ${
                form[key]
                  ? "bg-white text-black border-white font-medium"
                  : "bg-white/5 border-white/10 text-zinc-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Work Authorization</h2>
        <div>
          <label className={labelClass}>Authorization Status</label>
          <select
            className={inputClass}
            value={form.workAuthorization}
            onChange={(e) => set("workAuthorization", e.target.value)}
          >
            <option value="">Select status</option>
            <option value="us_citizen">U.S. Citizen or Permanent Resident</option>
            <option value="visa">Visa (H1B, O-1, etc.)</option>
            <option value="student_visa">Student Visa (OPT/CPT)</option>
            <option value="other">Other</option>
          </select>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.requiresSponsorship}
            onChange={(e) => set("requiresSponsorship", e.target.checked)}
            className="w-4 h-4 rounded accent-white"
          />
          <span className="text-sm text-zinc-400">I require visa sponsorship</span>
        </label>
      </div>

      <SaveButton
        saving={saving}
        disabled={!isIdentityComplete(initialData)}
        disabledReason="Complete the Personal tab first"
      />
    </form>
  );
}
