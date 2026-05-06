import { z } from "zod";
import type { DatePostedOption } from "@/types";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  EXPERIENCE_LEVEL_LABELS,
} from "@/lib/experience-level";

export const DATE_POSTED_OPTIONS = [
  "today",
  "3days",
  "week",
  "month",
  "any",
] as const;

export const SORT_OPTIONS = ["newest", "relevance", "recently_saved"] as const;

export const EMPLOYMENT_TYPE_OPTIONS = [
  "full_time",
  "part_time",
  "contract",
  "internship",
] as const;

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};

// Re-exported from src/lib/experience-level.ts so client components can pull
// these from a single barrel without crossing the server-only env-flag check.
export { EXPERIENCE_LEVEL_OPTIONS, EXPERIENCE_LEVEL_LABELS };

export const jobsQuerySchema = z.object({
  query: z.string().max(200).optional(),
  location: z.string().max(200).optional(),      // legacy plain-text
  locationCity: z.string().max(200).optional(),  // structured city
  locationState: z.string().max(50).optional(),  // structured state abbrev
  department: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  remote: z.enum(["true", "false"]).optional(),
  employmentType: z.string().max(50).optional(),
  experienceLevel: z.enum(EXPERIENCE_LEVEL_OPTIONS).optional(),
  datePosted: z.enum(DATE_POSTED_OPTIONS).default("any"),
  salaryMin: z.coerce.number().int().min(0).max(10_000_000).optional(),
  salaryMax: z.coerce.number().int().min(0).max(10_000_000).optional(),
  sort: z.enum(SORT_OPTIONS).default("newest"),
  provider: z.enum(["GREENHOUSE", "ASHBY"]).optional(), // filter by ATS provider
  saved: z.enum(["true", "false"]).optional(),          // restrict to current user's saved jobs
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type JobsQueryParams = z.infer<typeof jobsQuerySchema>;

export function datePostedToCutoff(option: DatePostedOption | string): Date | null {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  switch (option) {
    case "today":
      return new Date(now - ONE_DAY);
    case "3days":
      return new Date(now - 3 * ONE_DAY);
    case "week":
      return new Date(now - 7 * ONE_DAY);
    case "month":
      return new Date(now - 30 * ONE_DAY);
    default:
      return null;
  }
}
