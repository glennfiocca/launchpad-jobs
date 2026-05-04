"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import { UniversityCombobox } from "@/components/ui/university-combobox";
import { inputClass, labelClass, sectionClass, sectionTitleClass } from "./_shared/styles";
import { SaveButton } from "./_shared/save-button";
import { IdentityRequiredNotice, isIdentityComplete } from "./_shared/identity-gate";
import { buildPayload, getIdentityBase, submitProfilePatch } from "./_shared/submit";

type ProfileWithUniversity =
  | (UserProfile & { universityId?: string | null })
  | null;

interface EducationFormState {
  university: string;
  universityId: string;
  highestDegree: string;
  fieldOfStudy: string;
  graduationYear: string;
}

function initState(data: ProfileWithUniversity): EducationFormState {
  return {
    university: data?.university ?? "",
    universityId: data?.universityId ?? "",
    highestDegree: data?.highestDegree ?? "",
    fieldOfStudy: data?.fieldOfStudy ?? "",
    graduationYear: data?.graduationYear?.toString() ?? "",
  };
}

interface EducationFormProps {
  initialData: UserProfile | null;
}

export function EducationForm({ initialData }: EducationFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<EducationFormState>(initState(initialData));
  const [saving, setSaving] = useState(false);

  const set = (field: keyof EducationFormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const slice = {
      university: form.university || undefined,
      universityId: form.universityId || undefined,
      highestDegree: form.highestDegree || undefined,
      fieldOfStudy: form.fieldOfStudy || undefined,
      graduationYear: form.graduationYear ? Number(form.graduationYear) : undefined,
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
        <h2 className={sectionTitleClass}>Education</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Highest Degree</label>
            <select
              className={inputClass}
              value={form.highestDegree}
              onChange={(e) => set("highestDegree", e.target.value)}
            >
              <option value="">Select degree</option>
              <option value="high_school">High School</option>
              <option value="associate">Associate&apos;s</option>
              <option value="bachelor">Bachelor&apos;s</option>
              <option value="master">Master&apos;s</option>
              <option value="phd">PhD</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Graduation Year</label>
            <input
              className={inputClass}
              type="number"
              min="1950"
              max="2030"
              value={form.graduationYear}
              onChange={(e) => set("graduationYear", e.target.value)}
              placeholder="2019"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Field of Study</label>
            <input
              className={inputClass}
              value={form.fieldOfStudy}
              onChange={(e) => set("fieldOfStudy", e.target.value)}
              placeholder="Computer Science"
            />
          </div>
          <div>
            <label className={labelClass}>University / School</label>
            <UniversityCombobox
              value={form.university}
              universityId={form.universityId}
              onSelect={(id, name) => {
                setForm((prev) => ({ ...prev, university: name, universityId: id }));
              }}
              onClear={() => {
                setForm((prev) => ({ ...prev, university: "", universityId: "" }));
              }}
              placeholder="Search universities..."
            />
          </div>
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
