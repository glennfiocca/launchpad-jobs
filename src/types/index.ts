import type {
  User,
  UserProfile,
  Job,
  Company,
  Application,
  ApplicationEmail,
  ApplicationStatus,
} from "@prisma/client";

import type {
  SkillCategory,
  EmploymentType,
  LanguageProficiency,
  SecurityClearance,
  EquityImportance,
  SearchStatus,
  CompanySize,
} from "./_shared/profile-enums";

export type { ApplicationStatus };
export * from "./_shared/profile-enums";

// Job with company
export type JobWithCompany = Job & {
  company: Company;
  _count?: { applications: number };
};

// Application with full context
export type ApplicationWithJob = Application & {
  job: JobWithCompany;
  emails: ApplicationEmail[];
  statusHistory: {
    id: string;
    fromStatus: ApplicationStatus | null;
    toStatus: ApplicationStatus;
    reason: string | null;
    triggeredBy: string;
    createdAt: Date;
  }[];
};

// Greenhouse API types
export interface GreenhouseJob {
  id: number;
  title: string;
  updated_at: string;
  requisition_id: string | null;
  location: {
    name: string;
  };
  absolute_url: string;
  metadata: unknown[];
  content: string;
  departments: Array<{ id: number; name: string; parent_id: number | null }>;
  offices: Array<{ id: number; name: string; location: string | null }>;
  questions?: GreenhouseQuestion[];
}

export interface GreenhouseJobsResponse {
  jobs: GreenhouseJob[];
  meta: {
    total: number;
  };
}

export interface GreenhouseQuestionField {
  name: string;
  type:
    | "input_text"
    | "input_file"
    | "textarea"
    | "multi_value_single_select"
    | "multi_value_multi_select";
  values: Array<{ value: number; label: string }>;
}

export interface GreenhouseQuestion {
  label: string;
  required: boolean;
  description: string | null;
  fields: GreenhouseQuestionField[];
}

export interface QuestionMeta {
  label: string;
  fieldName: string;
  fieldType: GreenhouseQuestionField["type"];
  selectValues?: Array<{ value: string | number; label: string }>;
}

export interface PendingQuestion {
  label: string;
  fieldName: string;
  fieldType: GreenhouseQuestionField["type"];
  required: boolean;
  description: string | null;
  selectValues?: Array<{ value: string | number; label: string }>;
  userAnswer?: string;
}

// Job filter params
export type DatePostedOption = "today" | "3days" | "week" | "month" | "any";
export type SortOption = "newest" | "relevance" | "recently_saved";

export interface JobFilters {
  query?: string;
  location?: string;       // legacy plain-text (kept for backward compat)
  locationCity?: string;   // structured city from Google Places
  locationState?: string;  // structured state abbrev from Google Places
  department?: string;
  company?: string;
  employmentType?: string;
  /** Experience-level slug (entry|mid|senior|staff|management). */
  experienceLevel?: string;
  /** Work-mode slug (remote|hybrid|onsite). Supersedes the legacy `remote` boolean for listing filtering. */
  workMode?: string;
  datePosted?: DatePostedOption;
  salaryMin?: number;
  salaryMax?: number;
  sort?: SortOption;
  /** Restrict to current user's saved jobs. Requires authentication. */
  saved?: boolean;
  page?: number;
  limit?: number;
}

// Faceted counts returned on page-1 requests
export interface JobFacets {
  departments: Array<{ value: string; count: number }>;
  employmentTypes: Array<{ value: string; count: number }>;
  /** Experience-level slug counts (entry|mid|senior|staff|management). */
  experienceLevels: Array<{ value: string; count: number }>;
  /** Work-mode slug counts (remote|hybrid|onsite). */
  workModes: Array<{ value: string; count: number }>;
  companies: Array<{ id: string; name: string; count: number }>;
  totalRemote: number;
  salaryRange: { min: number | null; max: number | null };
}

// API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** ISO string — present on 402 credit limit responses */
  resetsAt?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
    facets?: JobFacets;
  };
}

// Billing
export interface CreditStatus {
  isSubscribed: boolean;
  creditsUsed: number;
  creditsRemaining: number;
  resetsAt: Date;
  referralCredits: number;
}

// Profile form data
export interface ProfileFormData {
  firstName: string;
  lastName: string;
  preferredFirstName?: string;
  email: string;
  phone?: string;
  location?: string;           // legacy display fallback
  // Structured address (Google Places)
  locationPlaceId?: string;
  locationFormatted?: string;
  locationCity?: string;
  locationState?: string;
  locationStreet?: string;
  locationPostalCode?: string;
  locationLat?: number;
  locationLng?: number;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  // Extended professional / social links
  twitterUrl?: string;
  stackOverflowUrl?: string;
  dribbbleUrl?: string;
  behanceUrl?: string;
  mediumUrl?: string;
  devToUrl?: string;
  googleScholarUrl?: string;
  huggingFaceUrl?: string;
  kaggleUrl?: string;
  youtubeUrl?: string;
  headline?: string;
  summary?: string;
  currentTitle?: string;
  currentCompany?: string;
  yearsExperience?: number;
  desiredSalaryMin?: number;
  desiredSalaryMax?: number;
  openToRemote: boolean;
  openToHybrid: boolean;
  openToOnsite: boolean;
  highestDegree?: string;
  fieldOfStudy?: string;
  university?: string;         // legacy display name
  universityId?: string;       // FK to University table
  graduationYear?: number;
  workAuthorization?: string;
  requiresSponsorship: boolean;
  // Job-search preferences
  noticePeriodWeeks?: number;
  /** ISO date string (YYYY-MM-DD or full ISO) — null when cleared */
  earliestStartDate?: string | null;
  targetRoles: string[];
  targetIndustries: string[];
  companySizePreferences: CompanySize[];
  relocationOpen: boolean;
  relocationCities: string[];
  currencyPreference: string;
  equityImportance?: EquityImportance;
  desiredEmploymentTypes: EmploymentType[];
  searchStatus: SearchStatus;
  // Compliance (standard ATS questions — none are PII)
  hasDriversLicense?: boolean;
  willingBackgroundCheck?: boolean;
  willingDrugTest?: boolean;
  securityClearance: SecurityClearance;
  eligibleCountries: string[]; // ISO-3166-1 alpha-2
  // Application templates
  coverLetterIntro?: string;
  whyImLookingTemplate?: string;
}

// ───────── Profile sub-resource inputs (Phase 1 expansion) ─────────
// Each interface mirrors its Prisma model minus generated/relation fields.
// `id?` is optional so the same shape works for create + update upserts.
// Dates are serialized as ISO strings on the wire.

export interface SkillInput {
  id?: string;
  name: string;
  category: SkillCategory;
  proficiency: number; // 1-5, validated app-side
  yearsUsed?: number | null;
  order: number;
}

export interface WorkExperienceInput {
  id?: string;
  title: string;
  company: string;
  companyUrl?: string | null;
  startDate: string;        // ISO
  endDate?: string | null;  // ISO
  isCurrent: boolean;
  location?: string | null;
  employmentType: EmploymentType;
  description?: string | null;
  order: number;
}

export interface EducationEntryInput {
  id?: string;
  universityId?: string | null;
  schoolName?: string | null;
  degree: string;
  fieldOfStudy: string;
  startYear?: number | null;
  endYear?: number | null;
  gpa?: number | null;
  honors?: string | null;
  activities?: string | null;
  order: number;
}

export interface ProjectInput {
  id?: string;
  name: string;
  url?: string | null;
  repoUrl?: string | null;
  description?: string | null;
  technologies: string[];
  role?: string | null;
  startDate?: string | null; // ISO
  endDate?: string | null;   // ISO
  isOngoing: boolean;
  order: number;
}

export interface CertificationInput {
  id?: string;
  name: string;
  issuer: string;
  issueDate?: string | null;  // ISO
  expiryDate?: string | null; // ISO
  credentialUrl?: string | null;
  credentialId?: string | null;
  order: number;
}

export interface SpokenLanguageInput {
  id?: string;
  name: string;
  proficiency: LanguageProficiency;
  order: number;
}

export * from "./admin"

// Status display config
export const STATUS_CONFIG: Record<
  ApplicationStatus,
  { label: string; color: string; description: string }
> = {
  APPLIED: {
    label: "Applied",
    color: "blue",
    description: "Application submitted",
  },
  REVIEWING: {
    label: "Under Review",
    color: "yellow",
    description: "Recruiter is reviewing your application",
  },
  PHONE_SCREEN: {
    label: "Phone Screen",
    color: "purple",
    description: "Phone/video screen scheduled or completed",
  },
  INTERVIEWING: {
    label: "Interviewing",
    color: "orange",
    description: "In active interview process",
  },
  OFFER: {
    label: "Offer",
    color: "green",
    description: "Received an offer",
  },
  REJECTED: {
    label: "Rejected",
    color: "red",
    description: "Application was not selected",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    color: "gray",
    description: "You withdrew your application",
  },
  LISTING_REMOVED: {
    label: "Listing Removed",
    color: "gray",
    description: "This job listing has been removed by the employer.",
  },
};
