"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { CheckCircle, AlertCircle } from "lucide-react";
import {
  EEOC_GENDER,
  EEOC_RACE,
  EEOC_VETERAN,
  EEOC_DISABILITY,
} from "@/lib/greenhouse/eeoc";

interface VoluntaryFormProps {
  initialData: UserProfile | null;
}

interface FormState {
  gender: string;
  race: string;
  veteranStatus: string;
  disability: string;
}

function initFormState(data: UserProfile | null): FormState {
  return {
    gender: data?.voluntaryGender ?? "",
    race: data?.voluntaryRace ?? "",
    veteranStatus: data?.voluntaryVeteranStatus ?? "",
    disability: data?.voluntaryDisability ?? "",
  };
}

export function VoluntaryForm({ initialData }: VoluntaryFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initFormState(initialData));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const set = (field: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const payload = {
      voluntaryGender: form.gender || null,
      voluntaryRace: form.race || null,
      voluntaryVeteranStatus: form.veteranStatus || null,
      voluntaryDisability: form.disability || null,
    };

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to save voluntary information");
      } else {
        setSuccess(true);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save voluntary information");
    }

    setSaving(false);
  };

  const inputClass =
    "w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm";
  const labelClass = "block text-sm font-medium text-slate-700 mb-1";
  const sectionClass = "bg-white rounded-xl border border-slate-200 p-6 space-y-4";
  const helpClass = "text-xs text-slate-500 mt-1 leading-relaxed";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Voluntary information saved successfully!
        </div>
      )}

      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-slate-900">Voluntary Self-Identification</h2>
        <p className="text-sm text-slate-500 -mt-2">
          Completing these fields is entirely voluntary. The information is used solely for EEOC/affirmative
          action reporting and will never affect how your application is evaluated. Answers are stored once
          and auto-filled on every Greenhouse application.
        </p>

        {/* Gender */}
        <div>
          <label className={labelClass}>Gender</label>
          <select
            className={inputClass}
            value={form.gender}
            onChange={(e) => set("gender", e.target.value)}
          >
            <option value="">Prefer not to answer</option>
            {Object.keys(EEOC_GENDER).map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
        </div>

        {/* Race / Ethnicity */}
        <div>
          <label className={labelClass}>Race / Ethnicity</label>
          <select
            className={inputClass}
            value={form.race}
            onChange={(e) => set("race", e.target.value)}
          >
            <option value="">Prefer not to answer</option>
            {Object.keys(EEOC_RACE).map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
        </div>

        {/* Veteran Status */}
        <div>
          <label className={labelClass}>Veteran Status</label>
          <p className={helpClass}>
            Protected veterans include: disabled veterans, recently separated veterans, active duty
            wartime or campaign badge veterans, and Armed Forces service medal veterans.
          </p>
          <select
            className={inputClass}
            value={form.veteranStatus}
            onChange={(e) => set("veteranStatus", e.target.value)}
          >
            <option value="">Prefer not to answer</option>
            {Object.keys(EEOC_VETERAN).map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
        </div>

        {/* Disability Status */}
        <div>
          <label className={labelClass}>Disability Status</label>
          <p className={helpClass}>
            Disabilities include: autism, autoimmune conditions, blindness, cancer (including remission),
            cardiovascular/heart disease, celiac disease, cerebral palsy, deafness, diabetes, epilepsy,
            ADHD, missing limbs, nervous system conditions, psychiatric conditions, PTSD, short stature,
            partial or full paralysis, and other conditions.
          </p>
          <select
            className={inputClass}
            value={form.disability}
            onChange={(e) => set("disability", e.target.value)}
          >
            <option value="">Prefer not to answer</option>
            {Object.keys(EEOC_DISABILITY).map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full py-3 px-6 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
      >
        {saving ? "Saving..." : "Save Voluntary Information"}
      </button>
    </form>
  );
}
