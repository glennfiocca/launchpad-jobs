"use client";

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
import { labelClass, pillBtnClass } from "./styles";

// ────────── Soft-enum coercion helpers ──────────
// Prisma stores the soft-enum columns as `string`. The Phase 1 schema
// constrains values via Zod on the API boundary, but the generated
// `UserProfile` type still types them as `string`, so we narrow when reading.

export function asSearchStatus(v: string | null | undefined): SearchStatus {
  return (SEARCH_STATUSES as readonly string[]).includes(v ?? "")
    ? (v as SearchStatus)
    : "open";
}

export function asSecurityClearance(
  v: string | null | undefined
): SecurityClearance {
  return (SECURITY_CLEARANCES as readonly string[]).includes(v ?? "")
    ? (v as SecurityClearance)
    : "none";
}

export function asEquityImportance(
  v: string | null | undefined
): EquityImportance | null {
  return (EQUITY_IMPORTANCE_VALUES as readonly string[]).includes(v ?? "")
    ? (v as EquityImportance)
    : null;
}

export function asEmploymentTypes(
  arr: string[] | null | undefined
): EmploymentType[] {
  if (!arr) return [];
  return arr.filter((v): v is EmploymentType =>
    (EMPLOYMENT_TYPES as readonly string[]).includes(v)
  );
}

export function asCompanySizes(
  arr: string[] | null | undefined
): CompanySize[] {
  if (!arr) return [];
  return arr.filter((v): v is CompanySize =>
    (COMPANY_SIZES as readonly string[]).includes(v)
  );
}

// ISO YYYY-MM-DD formatting for <input type="date">. Returns "" for nullish.
export function formatDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ────────── Label maps for select/radio buttons ──────────
export const SEARCH_STATUS_LABELS: Record<SearchStatus, string> = {
  "actively-looking": "Actively looking",
  open: "Open to opportunities",
  "not-looking": "Not looking",
};

export const EQUITY_LABELS: Record<EquityImportance, string> = {
  none: "Not important",
  some: "Some",
  high: "High",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};

export const COMPANY_SIZE_LABELS: Record<CompanySize, string> = {
  startup: "Startup",
  scaleup: "Scale-up",
  midsize: "Mid-size",
  enterprise: "Enterprise",
};

export const CLEARANCE_LABELS: Record<SecurityClearance, string> = {
  none: "None",
  confidential: "Confidential",
  secret: "Secret",
  "top-secret": "Top Secret",
};

// ────────── Tri-state radio (Yes / No / Prefer not to say) ──────────

interface TriStateProps {
  label: string;
  value: boolean | null;
  onChange: (next: boolean | null) => void;
}

export function TriStateRadio({ label, value, onChange }: TriStateProps) {
  const options: Array<{ key: string; label: string; v: boolean | null }> = [
    { key: "yes", label: "Yes", v: true },
    { key: "no", label: "No", v: false },
    { key: "skip", label: "Prefer not to say", v: null },
  ];
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
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

// ────────── ISO country code normalization + validation ──────────
// Server is the source of truth — these are UX niceties so users see
// inline feedback before they save. `normalizeCountryCode` uppercases
// and strips any non-letter characters; `validateCountryCode` then
// enforces an exact 2-letter length.

export function normalizeCountryCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, "");
}

export function validateCountryCode(chip: string): string | null {
  if (!/^[A-Z]{2}$/.test(chip)) {
    return "Use 2-letter ISO codes (e.g. US, CA, GB)";
  }
  return null;
}
