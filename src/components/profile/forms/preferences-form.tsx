"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import {
  COMPANY_SIZES,
  EMPLOYMENT_TYPES,
  EQUITY_IMPORTANCE_VALUES,
  SEARCH_STATUSES,
  SECURITY_CLEARANCES,
  type CompanySize,
  type EmploymentType,
  type EquityImportance,
  type SearchStatus,
  type SecurityClearance,
} from "@/types/_shared/profile-enums";
import { gridTwoCol, inputClass, labelClass, sectionClass, sectionTitleClass } from "./_shared/styles";
import { SaveButton } from "./_shared/save-button";
import { IdentityRequiredNotice, isIdentityComplete } from "./_shared/identity-gate";
import { buildPayload, getIdentityBase, submitProfilePatch } from "./_shared/submit";
import { ChipInput } from "./_shared/chip-input";
import {
  asCompanySizes,
  asEmploymentTypes,
  asEquityImportance,
  asSearchStatus,
  asSecurityClearance,
  formatDateInput,
  CLEARANCE_LABELS,
  COMPANY_SIZE_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  EQUITY_LABELS,
  SEARCH_STATUS_LABELS,
  TriStateRadio,
  validateCountryCode,
} from "./_shared/preferences-helpers";

// Preferences form local state. We model nullable tri-state booleans
// (compliance answers) explicitly as `boolean | null` because the API
// distinguishes "no answer" (null) from "no" (false).
interface PreferencesFormState {
  // Salary
  desiredSalaryMin: string;
  desiredSalaryMax: string;
  // Work modes
  openToRemote: boolean;
  openToHybrid: boolean;
  openToOnsite: boolean;
  // Authorization
  workAuthorization: string;
  requiresSponsorship: boolean;
  // Search preferences
  searchStatus: SearchStatus;
  noticePeriodWeeks: string;
  earliestStartDate: string; // YYYY-MM-DD or ""
  targetRoles: string[];
  targetIndustries: string[];
  desiredEmploymentTypes: EmploymentType[];
  companySizePreferences: CompanySize[];
  currencyPreference: string;
  equityImportance: EquityImportance | null;
  // Relocation
  relocationOpen: boolean;
  relocationCities: string[];
  // Compliance
  hasDriversLicense: boolean | null;
  willingBackgroundCheck: boolean | null;
  willingDrugTest: boolean | null;
  securityClearance: SecurityClearance;
  eligibleCountries: string[];
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
    searchStatus: asSearchStatus(data?.searchStatus),
    noticePeriodWeeks: data?.noticePeriodWeeks?.toString() ?? "",
    earliestStartDate: formatDateInput(data?.earliestStartDate),
    targetRoles: data?.targetRoles ?? [],
    targetIndustries: data?.targetIndustries ?? [],
    desiredEmploymentTypes: asEmploymentTypes(data?.desiredEmploymentTypes),
    companySizePreferences: asCompanySizes(data?.companySizePreferences),
    currencyPreference: data?.currencyPreference ?? "USD",
    equityImportance: asEquityImportance(data?.equityImportance),
    relocationOpen: data?.relocationOpen ?? false,
    relocationCities: data?.relocationCities ?? [],
    hasDriversLicense: data?.hasDriversLicense ?? null,
    willingBackgroundCheck: data?.willingBackgroundCheck ?? null,
    willingDrugTest: data?.willingDrugTest ?? null,
    securityClearance: asSecurityClearance(data?.securityClearance),
    eligibleCountries: data?.eligibleCountries ?? [],
  };
}

interface PreferencesFormProps {
  initialData: UserProfile | null;
}

export function PreferencesForm({ initialData }: PreferencesFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<PreferencesFormState>(initState(initialData));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof PreferencesFormState>(
    field: K,
    value: PreferencesFormState[K]
  ) => setForm((prev) => ({ ...prev, [field]: value }));

  const toggleEmploymentType = (t: EmploymentType) => {
    setForm((prev) => ({
      ...prev,
      desiredEmploymentTypes: prev.desiredEmploymentTypes.includes(t)
        ? prev.desiredEmploymentTypes.filter((x) => x !== t)
        : [...prev.desiredEmploymentTypes, t],
    }));
  };

  const toggleCompanySize = (s: CompanySize) => {
    setForm((prev) => ({
      ...prev,
      companySizePreferences: prev.companySizePreferences.includes(s)
        ? prev.companySizePreferences.filter((x) => x !== s)
        : [...prev.companySizePreferences, s],
    }));
  };

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
      searchStatus: form.searchStatus,
      noticePeriodWeeks: form.noticePeriodWeeks
        ? Number(form.noticePeriodWeeks)
        : null,
      earliestStartDate: form.earliestStartDate || null,
      targetRoles: form.targetRoles,
      targetIndustries: form.targetIndustries,
      desiredEmploymentTypes: form.desiredEmploymentTypes,
      companySizePreferences: form.companySizePreferences,
      currencyPreference: form.currencyPreference || "USD",
      equityImportance: form.equityImportance,
      relocationOpen: form.relocationOpen,
      relocationCities: form.relocationCities,
      hasDriversLicense: form.hasDriversLicense,
      willingBackgroundCheck: form.willingBackgroundCheck,
      willingDrugTest: form.willingDrugTest,
      securityClearance: form.securityClearance,
      // Server already enforces 2-char length; uppercase here for cleanliness.
      eligibleCountries: form.eligibleCountries.map((c) => c.toUpperCase()),
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Salary Expectations</h2>
        <div className={gridTwoCol}>
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
        <div className="flex gap-3 flex-wrap">
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
      </div>

      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Search Preferences</h2>

        <div>
          <label className={labelClass}>Search Status</label>
          <div className="flex gap-2 flex-wrap">
            {SEARCH_STATUSES.map((status) => {
              const active = form.searchStatus === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => set("searchStatus", status)}
                  aria-pressed={active}
                  className={`rounded-lg px-3 py-2 text-sm border transition-colors ${
                    active
                      ? "bg-white text-black border-white font-medium"
                      : "bg-white/5 border-white/10 text-zinc-400 hover:border-white/20"
                  }`}
                >
                  {SEARCH_STATUS_LABELS[status]}
                </button>
              );
            })}
          </div>
        </div>

        <div className={gridTwoCol}>
          <div>
            <label className={labelClass}>Notice period (weeks)</label>
            <input
              className={inputClass}
              type="number"
              min="0"
              max="52"
              value={form.noticePeriodWeeks}
              onChange={(e) => set("noticePeriodWeeks", e.target.value)}
              placeholder="2"
            />
          </div>
          <div>
            <label className={labelClass}>Earliest start date</label>
            <input
              className={inputClass}
              type="date"
              value={form.earliestStartDate}
              onChange={(e) => set("earliestStartDate", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Target roles</label>
          <ChipInput
            value={form.targetRoles}
            onChange={(next) => set("targetRoles", next)}
            placeholder="Senior Software Engineer, Staff ML Engineer..."
            maxChips={50}
          />
        </div>

        <div>
          <label className={labelClass}>Target industries</label>
          <ChipInput
            value={form.targetIndustries}
            onChange={(next) => set("targetIndustries", next)}
            placeholder="Fintech, Healthcare, Climate..."
            maxChips={50}
          />
        </div>

        <div>
          <label className={labelClass}>Desired employment types</label>
          <div className="flex gap-2 flex-wrap">
            {EMPLOYMENT_TYPES.map((t) => {
              const active = form.desiredEmploymentTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleEmploymentType(t)}
                  aria-pressed={active}
                  className={`rounded-lg px-3 py-2 text-sm border transition-colors ${
                    active
                      ? "bg-white text-black border-white font-medium"
                      : "bg-white/5 border-white/10 text-zinc-400 hover:border-white/20"
                  }`}
                >
                  {EMPLOYMENT_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={labelClass}>Company size</label>
          <div className="flex gap-2 flex-wrap">
            {COMPANY_SIZES.map((s) => {
              const active = form.companySizePreferences.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleCompanySize(s)}
                  aria-pressed={active}
                  className={`rounded-lg px-3 py-2 text-sm border transition-colors ${
                    active
                      ? "bg-white text-black border-white font-medium"
                      : "bg-white/5 border-white/10 text-zinc-400 hover:border-white/20"
                  }`}
                >
                  {COMPANY_SIZE_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>

        <div className={gridTwoCol}>
          <div>
            <label className={labelClass}>Currency preference</label>
            <input
              className={inputClass}
              value={form.currencyPreference}
              maxLength={3}
              onChange={(e) =>
                set("currencyPreference", e.target.value.toUpperCase())
              }
              placeholder="USD"
            />
          </div>
          <div>
            <label className={labelClass}>Equity importance</label>
            <div className="flex gap-2 flex-wrap">
              {EQUITY_IMPORTANCE_VALUES.map((v) => {
                const active = form.equityImportance === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() =>
                      set("equityImportance", active ? null : v)
                    }
                    aria-pressed={active}
                    className={`rounded-lg px-3 py-2 text-sm border transition-colors ${
                      active
                        ? "bg-white text-black border-white font-medium"
                        : "bg-white/5 border-white/10 text-zinc-400 hover:border-white/20"
                    }`}
                  >
                    {EQUITY_LABELS[v]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Relocation</h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.relocationOpen}
            onChange={(e) => set("relocationOpen", e.target.checked)}
            className="w-4 h-4 rounded accent-white"
          />
          <span className="text-sm text-zinc-300">
            I&apos;m open to relocating
          </span>
        </label>
        <div>
          <label className={labelClass}>
            Cities of interest{" "}
            <span className="text-zinc-600 font-normal">(optional)</span>
          </label>
          <ChipInput
            value={form.relocationCities}
            onChange={(next) => set("relocationCities", next)}
            placeholder="New York, Berlin, Remote..."
            disabled={!form.relocationOpen}
            maxChips={50}
          />
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
      </div>

      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Compliance</h2>
        <p className="text-xs text-zinc-500 -mt-2">
          Standard ATS questions — none of this is PII. Pick &ldquo;Prefer not to
          say&rdquo; to leave a question blank.
        </p>
        <TriStateRadio
          label="Do you have a valid driver's license?"
          value={form.hasDriversLicense}
          onChange={(v) => set("hasDriversLicense", v)}
        />
        <TriStateRadio
          label="Are you willing to undergo a background check?"
          value={form.willingBackgroundCheck}
          onChange={(v) => set("willingBackgroundCheck", v)}
        />
        <TriStateRadio
          label="Are you willing to undergo a drug test?"
          value={form.willingDrugTest}
          onChange={(v) => set("willingDrugTest", v)}
        />
        <div>
          <label className={labelClass}>Security clearance</label>
          <select
            className={inputClass}
            value={form.securityClearance}
            onChange={(e) =>
              set("securityClearance", e.target.value as SecurityClearance)
            }
          >
            {SECURITY_CLEARANCES.map((c) => (
              <option key={c} value={c}>
                {CLEARANCE_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>
            Eligible to work in (ISO country codes)
          </label>
          <ChipInput
            value={form.eligibleCountries}
            onChange={(next) => set("eligibleCountries", next)}
            placeholder="US, GB, CA..."
            validate={validateCountryCode}
            normalize={(raw) => raw.trim().toUpperCase()}
            maxChips={50}
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
