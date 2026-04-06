"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { CheckCircle, AlertCircle } from "lucide-react";

interface ProfileFormProps {
  initialData: UserProfile | null;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  headline: string;
  summary: string;
  currentTitle: string;
  currentCompany: string;
  yearsExperience: string;
  desiredSalaryMin: string;
  desiredSalaryMax: string;
  openToRemote: boolean;
  openToHybrid: boolean;
  openToOnsite: boolean;
  highestDegree: string;
  fieldOfStudy: string;
  university: string;
  graduationYear: string;
  workAuthorization: string;
  requiresSponsorship: boolean;
}

function initFormState(data: UserProfile | null): FormState {
  return {
    firstName: data?.firstName ?? "",
    lastName: data?.lastName ?? "",
    email: data?.email ?? "",
    phone: data?.phone ?? "",
    location: data?.location ?? "",
    linkedinUrl: data?.linkedinUrl ?? "",
    githubUrl: data?.githubUrl ?? "",
    portfolioUrl: data?.portfolioUrl ?? "",
    headline: data?.headline ?? "",
    summary: data?.summary ?? "",
    currentTitle: data?.currentTitle ?? "",
    currentCompany: data?.currentCompany ?? "",
    yearsExperience: data?.yearsExperience?.toString() ?? "",
    desiredSalaryMin: data?.desiredSalaryMin?.toString() ?? "",
    desiredSalaryMax: data?.desiredSalaryMax?.toString() ?? "",
    openToRemote: data?.openToRemote ?? true,
    openToHybrid: data?.openToHybrid ?? true,
    openToOnsite: data?.openToOnsite ?? false,
    highestDegree: data?.highestDegree ?? "",
    fieldOfStudy: data?.fieldOfStudy ?? "",
    university: data?.university ?? "",
    graduationYear: data?.graduationYear?.toString() ?? "",
    workAuthorization: data?.workAuthorization ?? "",
    requiresSponsorship: data?.requiresSponsorship ?? false,
  };
}

export function ProfileForm({ initialData }: ProfileFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initFormState(initialData));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const set = (field: keyof FormState, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const payload = {
      ...form,
      yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
      desiredSalaryMin: form.desiredSalaryMin ? Number(form.desiredSalaryMin) : undefined,
      desiredSalaryMax: form.desiredSalaryMax ? Number(form.desiredSalaryMax) : undefined,
      graduationYear: form.graduationYear ? Number(form.graduationYear) : undefined,
      linkedinUrl: form.linkedinUrl || undefined,
      githubUrl: form.githubUrl || undefined,
      portfolioUrl: form.portfolioUrl || undefined,
    };

    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save profile");
    } else {
      setSuccess(true);
      router.refresh();
    }
    setSaving(false);
  };

  const inputClass =
    "w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm";
  const labelClass = "block text-sm font-medium text-slate-700 mb-1";
  const sectionClass = "bg-white rounded-xl border border-slate-200 p-6 space-y-4";

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
          Profile saved successfully!
        </div>
      )}

      {/* Personal Info */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-slate-900">Personal Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>First Name *</label>
            <input className={inputClass} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required placeholder="Jane" />
          </div>
          <div>
            <label className={labelClass}>Last Name *</label>
            <input className={inputClass} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required placeholder="Doe" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Email *</label>
            <input className={inputClass} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required placeholder="jane@example.com" />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input className={inputClass} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 (555) 000-0000" />
          </div>
        </div>
        <div>
          <label className={labelClass}>Location</label>
          <input className={inputClass} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="San Francisco, CA" />
        </div>
      </div>

      {/* Professional Links */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-slate-900">Professional Links</h2>
        <div>
          <label className={labelClass}>LinkedIn URL</label>
          <input className={inputClass} type="url" value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="https://linkedin.com/in/yourname" />
        </div>
        <div>
          <label className={labelClass}>GitHub URL</label>
          <input className={inputClass} type="url" value={form.githubUrl} onChange={(e) => set("githubUrl", e.target.value)} placeholder="https://github.com/yourname" />
        </div>
        <div>
          <label className={labelClass}>Portfolio / Website</label>
          <input className={inputClass} type="url" value={form.portfolioUrl} onChange={(e) => set("portfolioUrl", e.target.value)} placeholder="https://yoursite.com" />
        </div>
      </div>

      {/* Professional Summary */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-slate-900">Professional Summary</h2>
        <div>
          <label className={labelClass}>Headline</label>
          <input className={inputClass} value={form.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Senior Software Engineer at Acme Corp" />
        </div>
        <div>
          <label className={labelClass}>Current Title</label>
          <input className={inputClass} value={form.currentTitle} onChange={(e) => set("currentTitle", e.target.value)} placeholder="Software Engineer" />
        </div>
        <div>
          <label className={labelClass}>Current Company</label>
          <input className={inputClass} value={form.currentCompany} onChange={(e) => set("currentCompany", e.target.value)} placeholder="Acme Corp" />
        </div>
        <div>
          <label className={labelClass}>Years of Experience</label>
          <input className={inputClass} type="number" min="0" max="50" value={form.yearsExperience} onChange={(e) => set("yearsExperience", e.target.value)} placeholder="5" />
        </div>
        <div>
          <label className={labelClass}>Bio / Summary</label>
          <textarea className={inputClass} rows={4} value={form.summary} onChange={(e) => set("summary", e.target.value)} placeholder="Tell employers about yourself..." />
        </div>
      </div>

      {/* Salary Preferences */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-slate-900">Salary Expectations</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Minimum (USD/year)</label>
            <input className={inputClass} type="number" min="0" value={form.desiredSalaryMin} onChange={(e) => set("desiredSalaryMin", e.target.value)} placeholder="120000" />
          </div>
          <div>
            <label className={labelClass}>Maximum (USD/year)</label>
            <input className={inputClass} type="number" min="0" value={form.desiredSalaryMax} onChange={(e) => set("desiredSalaryMax", e.target.value)} placeholder="160000" />
          </div>
        </div>
      </div>

      {/* Work Preferences */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-slate-900">Work Preferences</h2>
        <div className="space-y-3">
          {[
            { key: "openToRemote" as const, label: "Open to Remote" },
            { key: "openToHybrid" as const, label: "Open to Hybrid" },
            { key: "openToOnsite" as const, label: "Open to On-site" },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form[key] as boolean}
                onChange={(e) => set(key, e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Education */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-slate-900">Education</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Highest Degree</label>
            <select className={inputClass} value={form.highestDegree} onChange={(e) => set("highestDegree", e.target.value)}>
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
            <input className={inputClass} type="number" min="1950" max="2030" value={form.graduationYear} onChange={(e) => set("graduationYear", e.target.value)} placeholder="2019" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Field of Study</label>
            <input className={inputClass} value={form.fieldOfStudy} onChange={(e) => set("fieldOfStudy", e.target.value)} placeholder="Computer Science" />
          </div>
          <div>
            <label className={labelClass}>University / School</label>
            <input className={inputClass} value={form.university} onChange={(e) => set("university", e.target.value)} placeholder="State University" />
          </div>
        </div>
      </div>

      {/* Work Authorization */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-slate-900">Work Authorization</h2>
        <div>
          <label className={labelClass}>Authorization Status</label>
          <select className={inputClass} value={form.workAuthorization} onChange={(e) => set("workAuthorization", e.target.value)}>
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
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700">I require visa sponsorship</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full py-3 px-6 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
      >
        {saving ? "Saving..." : "Save Profile"}
      </button>
    </form>
  );
}
