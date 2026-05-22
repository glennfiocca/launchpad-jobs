"use client";

/**
 * PreferencesForm — Direction A redesign.
 *
 * Mirrors the personal-form.tsx reference implementation: three editorial
 * section cards (Search Preferences, Relocation, Compliance), each rendered
 * with `directionASectionClass` + `SectionHeader` + `SavedPill`. Pill toggles
 * (search status, work modes, employment types, company sizes, equity) all
 * route through `pillBtnClass()` so the active state is lavender, not white.
 *
 * Data shape is preserved exactly — same `PreferencesFormState`, same
 * `buildPayload` slice, same identity-gate, same single-shot submit. The
 * redesign is purely visual + structural (3 sections instead of 6).
 *
 * Local atoms inside this file (DirectionATriState, sectionEyebrowFor):
 *  - DirectionATriState reuses the shared TriStateRadio's data contract but
 *    re-skins the buttons through `pillBtnClass` because the shared helper
 *    still ships the legacy white-active styling and lives outside this PR's
 *    one-file scope. Keeping it inline here avoids cross-file edits while
 *    matching the Direction A treatment exactly.
 *
 * Motion is gated on the cockpit-wide reduced-motion preference via the
 * SavedPill atom; this form introduces no new framer-motion animations.
 */

import { useCallback, useState } from "react";
import type { UserProfile } from "@prisma/client";
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
import {
  directionAInputClass,
  directionASectionClass,
  gridTwoCol,
  labelClass,
  pillBtnClass,
  sectionDividerClass,
} from "./_shared/styles";
import { FormEyebrow, SavedPill, SectionHeader } from "./_shared/atoms";
import { IdentityRequiredNotice, isIdentityComplete } from "./_shared/identity-gate";
import { buildPayload, getIdentityBase } from "./_shared/submit";
import { useDebouncedProfileSave } from "./_shared/use-debounced-profile-save";
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
  normalizeCountryCode,
  validateCountryCode,
} from "./_shared/preferences-helpers";

// ────────── Local form state ──────────
// Mirrors the API contract — boolean | null for tri-state compliance answers
// so we can distinguish "no answer" (null) from "no" (false).
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

// ────────── Local Direction A tri-state ──────────
// The shared TriStateRadio in `_shared/preferences-helpers.tsx` still ships
// the legacy white-on-black active state. This redesign is one-file-scoped,
// so we keep the shared helper's data contract (`boolean | null`) but
// re-skin the buttons through `pillBtnClass` for the lavender treatment.
interface DirectionATriStateProps {
  label: string;
  value: boolean | null;
  onChange: (next: boolean | null) => void;
}

const TRI_STATE_OPTIONS: ReadonlyArray<{
  key: "yes" | "no" | "skip";
  label: string;
  v: boolean | null;
}> = [
  { key: "yes", label: "Yes", v: true },
  { key: "no", label: "No", v: false },
  { key: "skip", label: "Prefer not to say", v: null },
];

function DirectionATriState({ label, value, onChange }: DirectionATriStateProps) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="flex flex-wrap gap-2">
        {TRI_STATE_OPTIONS.map((opt) => {
          const active = value === opt.v;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.v)}
              aria-pressed={active}
              className={pillBtnClass(active)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ────────── Direction A checkbox row ──────────
// Re-skins the legacy `<input type=checkbox>` rows (relocationOpen,
// requiresSponsorship) into a lavender-tinted toggle that matches the rest
// of the Direction A surface. Falls back to a real <input> for a11y so the
// native focus ring + keyboard handling stays correct.
interface DirectionACheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}

function DirectionACheckbox({ checked, onChange, label }: DirectionACheckboxProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer text-sm text-text-muted">
      <span className="relative inline-flex items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer w-4 h-4 appearance-none rounded-[5px] border border-white/15 bg-white/[0.03] transition-colors checked:bg-[rgba(196,181,253,0.85)] checked:border-[var(--color-accent-lavender)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(196,181,253,0.30)]"
        />
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="pointer-events-none absolute h-3 w-3 text-bg opacity-0 peer-checked:opacity-100 transition-opacity"
        >
          <path
            d="M2.5 6.2l2.4 2.4L9.5 3.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>{label}</span>
    </label>
  );
}

interface PreferencesFormProps {
  initialData: UserProfile | null;
}

export function PreferencesForm({ initialData }: PreferencesFormProps) {
  const [form, setForm] = useState<PreferencesFormState>(initState(initialData));

  const buildPreferencesPayload = useCallback(() => {
    const slice = {
      desiredSalaryMin: form.desiredSalaryMin
        ? Number(form.desiredSalaryMin)
        : undefined,
      desiredSalaryMax: form.desiredSalaryMax
        ? Number(form.desiredSalaryMax)
        : undefined,
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
    return buildPayload(getIdentityBase(initialData), slice);
  }, [form, initialData]);

  const { schedule, saving, recentlySaved } =
    useDebouncedProfileSave(buildPreferencesPayload);

  // Every state update — single-field set, toggle, multi-field setForm —
  // schedules a debounced save. Wrap setForm so multi-field updates work too.
  const set = <K extends keyof PreferencesFormState>(
    field: K,
    value: PreferencesFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    schedule();
  };

  const toggleEmploymentType = (t: EmploymentType) => {
    setForm((prev) => ({
      ...prev,
      desiredEmploymentTypes: prev.desiredEmploymentTypes.includes(t)
        ? prev.desiredEmploymentTypes.filter((x) => x !== t)
        : [...prev.desiredEmploymentTypes, t],
    }));
    schedule();
  };

  const toggleCompanySize = (s: CompanySize) => {
    setForm((prev) => ({
      ...prev,
      companySizePreferences: prev.companySizePreferences.includes(s)
        ? prev.companySizePreferences.filter((x) => x !== s)
        : [...prev.companySizePreferences, s],
    }));
    schedule();
  };

  const workModes: ReadonlyArray<{
    key: "openToRemote" | "openToHybrid" | "openToOnsite";
    label: string;
  }> = [
    { key: "openToRemote", label: "Remote" },
    { key: "openToHybrid", label: "Hybrid" },
    { key: "openToOnsite", label: "Onsite" },
  ];

  const identityOk = isIdentityComplete(initialData);

  return (
    <div className="space-y-6">
      <IdentityRequiredNotice initialData={initialData} />

      {/* ───────── Section 1: Search Preferences ───────── */}
      <section className={directionASectionClass}>
        <SectionHeader
          eyebrow={
            <FormEyebrow accent>preferences · what you&apos;re looking for</FormEyebrow>
          }
          title="Search Preferences"
          subtitle="Set the bar — search status, target roles, comp, and the shape of the role you want next."
          right={<SavedPill visible={recentlySaved} />}
        />

        {/* Search status — full-width pill row */}
        <div>
          <label className={labelClass}>Search status</label>
          <div className="flex gap-2 flex-wrap">
            {SEARCH_STATUSES.map((status) => {
              const active = form.searchStatus === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => set("searchStatus", status)}
                  aria-pressed={active}
                  className={pillBtnClass(active)}
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
              className={`${directionAInputClass} font-mono tabular-nums`}
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
              className={`${directionAInputClass} font-mono tabular-nums`}
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
                  className={pillBtnClass(active)}
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
                  className={pillBtnClass(active)}
                >
                  {COMPANY_SIZE_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Comp + work mode group — hairline rule above */}
        <div className={sectionDividerClass}>
          <FormEyebrow>compensation · work mode</FormEyebrow>

          <div className={`${gridTwoCol} mt-3`}>
            <div>
              <label className={labelClass}>Minimum salary (per year)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim text-sm pointer-events-none font-mono">
                  $
                </span>
                <input
                  className={`${directionAInputClass} pl-7 font-mono tabular-nums`}
                  type="number"
                  min="0"
                  value={form.desiredSalaryMin}
                  onChange={(e) => set("desiredSalaryMin", e.target.value)}
                  placeholder="120000"
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Maximum salary (per year)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim text-sm pointer-events-none font-mono">
                  $
                </span>
                <input
                  className={`${directionAInputClass} pl-7 font-mono tabular-nums`}
                  type="number"
                  min="0"
                  value={form.desiredSalaryMax}
                  onChange={(e) => set("desiredSalaryMax", e.target.value)}
                  placeholder="160000"
                />
              </div>
            </div>
          </div>

          <div className={`${gridTwoCol} mt-4`}>
            <div>
              <label className={labelClass}>Currency</label>
              <input
                className={`${directionAInputClass} font-mono tabular-nums`}
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
                      className={pillBtnClass(active)}
                    >
                      {EQUITY_LABELS[v]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className={labelClass}>Open to (work mode)</label>
            <div className="flex gap-2 flex-wrap">
              {workModes.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set(key, !form[key])}
                  aria-pressed={form[key]}
                  className={pillBtnClass(form[key])}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Section 2: Relocation ───────── */}
      <section className={directionASectionClass}>
        <SectionHeader
          eyebrow={<FormEyebrow>relocation · where you&apos;ll go</FormEyebrow>}
          title="Relocation"
          subtitle="Whether you&apos;ll pack a box for the right role — and which cities are on the table."
        />

        <DirectionACheckbox
          checked={form.relocationOpen}
          onChange={(next) => set("relocationOpen", next)}
          label="I'm open to relocating for the right role"
        />

        <div>
          <label className={labelClass}>
            Cities of interest{" "}
            <span className="text-text-dim font-normal">
              (optional — leave blank to keep your options open)
            </span>
          </label>
          <ChipInput
            value={form.relocationCities}
            onChange={(next) => set("relocationCities", next)}
            placeholder="New York, Berlin, Remote..."
            disabled={!form.relocationOpen}
            maxChips={50}
          />
        </div>
      </section>

      {/* ───────── Section 3: Compliance ───────── */}
      <section className={directionASectionClass}>
        <SectionHeader
          eyebrow={<FormEyebrow>compliance · standard ats questions</FormEyebrow>}
          title="Compliance"
          subtitle="The boilerplate every ATS asks. None of it is PII — pick &ldquo;Prefer not to say&rdquo; to leave a question blank."
        />

        <div>
          <label className={labelClass}>Work authorization</label>
          <select
            className={directionAInputClass}
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

        <DirectionACheckbox
          checked={form.requiresSponsorship}
          onChange={(next) => set("requiresSponsorship", next)}
          label="I require visa sponsorship"
        />

        <div className={sectionDividerClass}>
          <FormEyebrow>screening</FormEyebrow>
          <div className="mt-3 space-y-4">
            <DirectionATriState
              label="Do you have a valid driver's license?"
              value={form.hasDriversLicense}
              onChange={(v) => set("hasDriversLicense", v)}
            />
            <DirectionATriState
              label="Are you willing to undergo a background check?"
              value={form.willingBackgroundCheck}
              onChange={(v) => set("willingBackgroundCheck", v)}
            />
            <DirectionATriState
              label="Are you willing to undergo a drug test?"
              value={form.willingDrugTest}
              onChange={(v) => set("willingDrugTest", v)}
            />
          </div>
        </div>

        <div className={sectionDividerClass}>
          <FormEyebrow>clearance · eligibility</FormEyebrow>

          <div className={`${gridTwoCol} mt-3`}>
            <div>
              <label className={labelClass}>Security clearance</label>
              <select
                className={directionAInputClass}
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
                Eligible to work in{" "}
                <span className="text-text-dim font-normal font-mono tabular-nums">
                  (ISO codes)
                </span>
              </label>
              <ChipInput
                value={form.eligibleCountries}
                onChange={(next) => set("eligibleCountries", next)}
                placeholder="US, CA, GB"
                validate={validateCountryCode}
                normalize={normalizeCountryCode}
                maxChips={50}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Live save indicator — replaces the explicit Save button. */}
      {saving && (
        <div className="flex items-center justify-end">
          <FormEyebrow>
            {identityOk ? "saving…" : "complete the Personal tab to save"}
          </FormEyebrow>
        </div>
      )}
    </div>
  );
}
