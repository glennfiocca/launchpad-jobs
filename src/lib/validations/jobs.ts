import { z } from "zod";
import type { DatePostedOption } from "@/types";

export const DATE_POSTED_OPTIONS = [
  "today",
  "3days",
  "week",
  "month",
  "any",
] as const;

export const SORT_OPTIONS = ["newest", "relevance"] as const;

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

export const jobsQuerySchema = z.object({
  query: z.string().max(200).optional(),
  location: z.string().max(200).optional(),      // legacy plain-text
  locationCity: z.string().max(200).optional(),  // structured city
  locationState: z.string().max(50).optional(),  // structured state abbrev
  department: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  remote: z.enum(["true", "false"]).optional(),
  employmentType: z.string().max(50).optional(),
  datePosted: z.enum(DATE_POSTED_OPTIONS).default("any"),
  salaryMin: z.coerce.number().int().min(0).max(10_000_000).optional(),
  salaryMax: z.coerce.number().int().min(0).max(10_000_000).optional(),
  sort: z.enum(SORT_OPTIONS).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type JobsQueryParams = z.infer<typeof jobsQuerySchema>;

export function datePostedToCutoff(option: DatePostedOption | string): Date | null {
  switch (option) {
    case "today":
      return new Date(new Date().setHours(0, 0, 0, 0));
    case "3days":
      return new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    case "week":
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}
