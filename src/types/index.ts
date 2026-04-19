import type {
  User,
  UserProfile,
  Job,
  Company,
  Application,
  ApplicationEmail,
  ApplicationStatus,
} from "@prisma/client";

export type { ApplicationStatus };

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
  selectValues?: Array<{ value: number; label: string }>;
}

export interface PendingQuestion {
  label: string;
  fieldName: string;
  fieldType: GreenhouseQuestionField["type"];
  required: boolean;
  description: string | null;
  selectValues?: Array<{ value: number; label: string }>;
  userAnswer?: string;
}

// Job filter params
export type DatePostedOption = "today" | "3days" | "week" | "month" | "any";
export type SortOption = "newest" | "relevance";

export interface JobFilters {
  query?: string;
  location?: string;       // legacy plain-text (kept for backward compat)
  locationCity?: string;   // structured city from Google Places
  locationState?: string;  // structured state abbrev from Google Places
  department?: string;
  company?: string;
  remote?: boolean;
  employmentType?: string;
  datePosted?: DatePostedOption;
  salaryMin?: number;
  salaryMax?: number;
  sort?: SortOption;
  page?: number;
  limit?: number;
}

// Faceted counts returned on page-1 requests
export interface JobFacets {
  departments: Array<{ value: string; count: number }>;
  employmentTypes: Array<{ value: string; count: number }>;
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
}

// Profile form data
export interface ProfileFormData {
  firstName: string;
  lastName: string;
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
