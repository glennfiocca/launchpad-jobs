// Shared profile enum-like unions. The DB stores these as TEXT (matching the
// project convention of soft-enums) and the app validates against the value
// arrays below — the same constants drive Zod schemas + UI <select> options
// + form validators, so values are guaranteed to stay in sync.

export const SKILL_CATEGORIES = ["language", "framework", "tool", "domain", "soft"] as const
export type SkillCategory = (typeof SKILL_CATEGORIES)[number]

export const EMPLOYMENT_TYPES = ["full-time", "part-time", "contract", "internship", "temporary"] as const
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]

export const LANGUAGE_PROFICIENCIES = ["native", "fluent", "professional", "conversational", "basic"] as const
export type LanguageProficiency = (typeof LANGUAGE_PROFICIENCIES)[number]

export const SECURITY_CLEARANCES = ["none", "confidential", "secret", "top-secret"] as const
export type SecurityClearance = (typeof SECURITY_CLEARANCES)[number]

export const EQUITY_IMPORTANCE_VALUES = ["none", "some", "high"] as const
export type EquityImportance = (typeof EQUITY_IMPORTANCE_VALUES)[number]

export const SEARCH_STATUSES = ["actively-looking", "open", "not-looking"] as const
export type SearchStatus = (typeof SEARCH_STATUSES)[number]

export const COMPANY_SIZES = ["startup", "scaleup", "midsize", "enterprise"] as const
export type CompanySize = (typeof COMPANY_SIZES)[number]
