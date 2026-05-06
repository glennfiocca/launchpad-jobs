import type { AtsProvider } from "@prisma/client";

/** Normalized job as returned by any ATS provider before DB persistence */
export interface NormalizedJob {
  externalId: string;
  title: string;
  location: string | null;
  department: string | null;
  employmentType: string | null;
  /**
   * Experience-level slug inferred from `title` (entry | mid | senior | staff
   * | management). See src/lib/experience-level.ts. Always populated — the
   * heuristic returns "mid" by default rather than null.
   */
  experienceLevel: string;
  /**
   * Work-mode slug inferred from title/location/content/remote
   * (remote | hybrid | onsite). See src/lib/work-mode.ts. Always populated —
   * the heuristic returns "onsite" by default rather than null.
   */
  workMode: string;
  remote: boolean;
  absoluteUrl: string | null;
  applyUrl: string | null;
  content: string | null; // HTML
  postedAt: Date | null;
  compensation?: {
    min: number | null;
    max: number | null;
    currency: string | null;
  };
  /**
   * Location classification produced by src/lib/location-classifier. Mappers
   * call the classifier with whatever signals their provider exposes (Ashby:
   * structured addressCountry + secondaryLocations; Greenhouse: free text).
   */
  countryCode: string | null;
  locationCategory: string;
  isUSEligible: boolean;
}

/** Normalized application question */
export interface NormalizedQuestion {
  id: string; // field identifier
  label: string;
  required: boolean;
  description: string | null;
  fieldType: NormalizedFieldType;
  options?: ReadonlyArray<{ value: string; label: string }>;
}

export type NormalizedFieldType =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "file"
  | "select"
  | "multiselect"
  | "date"
  | "number"
  | "boolean"
  | "url";

/** Board metadata returned during sync */
export interface BoardMeta {
  name: string;
  website: string | null;
  logoUrl: string | null;
}

/** Reads job listings from an ATS */
export interface AtsClient {
  readonly provider: AtsProvider;
  getBoard(): Promise<BoardMeta>;
  getJobs(): Promise<readonly NormalizedJob[]>;
  getJobQuestions(
    jobExternalId: string
  ): Promise<readonly NormalizedQuestion[]>;
}

/** Applies to a job on an ATS via Playwright */
export interface AtsApplyStrategy {
  readonly provider: AtsProvider;
  apply(options: AtsApplyOptions): Promise<AtsApplyResult>;
}

export interface AtsApplyOptions {
  boardToken: string;
  jobExternalId: string;
  applyUrl: string;
  /**
   * Per-company CSS selector override for the "Apply" trigger button on
   * self-hoster careers pages. When non-null, the Ashby Playwright strategy
   * uses ONLY this selector instead of the generic fallback chain. Mirrors
   * `Company.applySelector` (Track A.2 of HARDENING_PLAN.md).
   */
  applySelector?: string | null;
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    location: string | null;
    linkedInUrl: string | null;
    githubUrl: string | null;
    websiteUrl: string | null;
    preferredFirstName?: string | null;
  };
  trackingEmail: string;
  resumeBuffer?: Buffer;
  resumeFileName?: string;
  coverLetter?: string;
  questionAnswers?: Record<string, string | number>;
}

export interface AtsApplyResult {
  success: boolean;
  applicationId?: string;
  errorCode?: string;
  error?: string;
  manualApplyUrl?: string;
}

/** Validates whether a board token/name exists */
export interface AtsDiscoveryValidator {
  readonly provider: AtsProvider;
  validate(token: string): Promise<{
    valid: boolean;
    board?: { name: string; jobCount: number; token: string };
    error?: string;
  }>;
}

/** Sync result per board */
export interface SyncBoardOutcome {
  boardToken: string;
  provider: AtsProvider;
  jobsCreated: number;
  jobsUpdated: number;
  jobsDeactivated: number;
  error?: string;
}
