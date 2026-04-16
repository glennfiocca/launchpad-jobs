"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { CheckCircle, AlertCircle, Upload, FileText, X, Loader2 } from "lucide-react";

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

  // Resume state
  const [resumeUrl, setResumeUrl] = useState<string>(initialData?.resumeUrl ?? "");
  const [resumeFileName, setResumeFileName] = useState<string>(initialData?.resumeFileName ?? "");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setUploadError("Please upload a PDF file");
      return;
    }
    setUploadError(null);
    setIsUploading(true);
    const data = new FormData();
    data.append("resume", file);
    const res = await fetch("/api/profile/resume", { method: "POST", body: data });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setUploadError(json.error ?? "Upload failed");
    } else {
      setResumeFileName(file.name);
      setResumeUrl("/api/profile/resume"); // preview via our own endpoint
      setUploadError(null);
    }
    setIsUploading(false);
  };

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
      resumeUrl: resumeUrl || undefined,
      resumeFileName: resumeFileName || undefined,
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
    "bg-black border border-white/10 text-white rounded-xl px-4 py-2.5 w-full text-sm placeholder:text-zinc-700 transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]";
  const labelClass = "block text-sm text-zinc-400 font-medium mb-1";
  const sectionClass = "bg-[#0a0a0a] border border-white/8 rounded-2xl p-6 space-y-4";
  const sectionTitleClass = "text-white font-semibold text-sm uppercase tracking-wide mb-4";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Profile saved successfully!
        </div>
      )}

      {/* Personal Info */}
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Personal Information</h2>
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
        <h2 className={sectionTitleClass}>Professional Links</h2>
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

      {/* Resume */}
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Resume</h2>
        <p className="text-sm text-zinc-500 -mt-2">
          Your resume is attached automatically when you apply. PDF only, max 8MB.
        </p>

        {resumeUrl ? (
          <div className="flex items-center justify-between bg-[#111111] border border-white/8 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-zinc-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-400">{resumeFileName || "resume.pdf"}</p>
                <a href="/api/profile/resume" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  View Resume
                </a>
              </div>
            </div>
            <button type="button" onClick={() => { setResumeUrl(""); setResumeFileName(""); }}
              className="text-zinc-600 hover:text-zinc-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full flex flex-col items-center justify-center gap-2 bg-black border-2 border-dashed border-white/10 rounded-xl py-8 hover:border-white/20 transition-colors disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                <span className="text-sm text-zinc-500">Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 text-zinc-600" />
                <span className="text-sm font-medium text-zinc-400">Upload PDF</span>
                <span className="text-xs text-zinc-600">Max 8MB</span>
              </>
            )}
          </button>
        )}

        {uploadError && (
          <p className="text-sm text-red-400 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {uploadError}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Professional Summary */}
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Professional Summary</h2>
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
          <textarea
            className={`${inputClass} resize-none`}
            rows={4}
            value={form.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="Tell employers about yourself..."
          />
        </div>
      </div>

      {/* Salary Preferences */}
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Salary Expectations</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Minimum (USD/year)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">$</span>
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
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">$</span>
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

      {/* Work Preferences */}
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Work Preferences</h2>
        <div className="flex gap-3">
          {[
            { key: "openToRemote" as const, label: "Remote" },
            { key: "openToHybrid" as const, label: "Hybrid" },
            { key: "openToOnsite" as const, label: "Onsite" },
          ].map(({ key, label }) => (
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

      {/* Education */}
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Education</h2>
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
        <h2 className={sectionTitleClass}>Work Authorization</h2>
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
            className="w-4 h-4 rounded accent-white"
          />
          <span className="text-sm text-zinc-400">I require visa sponsorship</span>
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="bg-white text-black font-semibold rounded-xl px-6 py-3 hover:bg-zinc-100 transition-colors disabled:opacity-50 text-sm"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </form>
  );
}
