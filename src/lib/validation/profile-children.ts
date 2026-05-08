import { z } from "zod";
import {
  SKILL_CATEGORIES,
  EMPLOYMENT_TYPES,
  LANGUAGE_PROFICIENCIES,
} from "@/types/_shared/profile-enums";

// Shared building blocks ─────────────────────────────────────────────────
// `urlOrEmpty` mirrors the existing pattern used in /api/profile for social
// URLs — accepts a real URL, an empty string (UI default), or null/undefined.
const urlOrEmpty = z
  .string()
  .url()
  .nullable()
  .optional()
  .or(z.literal(""));

const orderField = z.number().int().min(0).default(0);

// Skill ──────────────────────────────────────────────────────────────────
export const skillSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(SKILL_CATEGORIES),
  proficiency: z.number().int().min(1).max(5),
  yearsUsed: z.number().int().min(0).max(60).nullable().optional(),
  order: orderField,
});
export const skillUpdateSchema = skillSchema.partial();
export const skillArraySchema = z.array(skillSchema);

// WorkExperience ─────────────────────────────────────────────────────────
export const workExperienceSchema = z
  .object({
    title: z.string().min(1).max(200),
    company: z.string().min(1).max(200),
    companyUrl: urlOrEmpty,
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
    isCurrent: z.boolean().default(false),
    location: z.string().max(200).nullable().optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    description: z.string().max(5000).nullable().optional(),
    order: orderField,
  })
  .superRefine((val, ctx) => {
    if (val.isCurrent && val.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endDate must be null when isCurrent is true",
        path: ["endDate"],
      });
    }
    if (val.endDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endDate must be on or after startDate",
        path: ["endDate"],
      });
    }
  });
// Note: superRefined schemas can't `.partial()`, so the update variant uses
// the underlying object schema partial-ed and re-applies the same refinement.
const workExperienceObject = z.object({
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  companyUrl: urlOrEmpty,
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  isCurrent: z.boolean(),
  location: z.string().max(200).nullable().optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  description: z.string().max(5000).nullable().optional(),
  order: orderField,
});
export const workExperienceUpdateSchema = workExperienceObject
  .partial()
  .superRefine((val, ctx) => {
    if (val.isCurrent === true && val.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endDate must be null when isCurrent is true",
        path: ["endDate"],
      });
    }
    if (val.endDate && val.startDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endDate must be on or after startDate",
        path: ["endDate"],
      });
    }
  });

// EducationEntry ─────────────────────────────────────────────────────────
const yearField = z.number().int().min(1900).max(2100);
export const educationEntrySchema = z
  .object({
    universityId: z.string().cuid().nullable().optional(),
    schoolName: z.string().max(200).nullable().optional(),
    degree: z.string().min(1).max(120),
    fieldOfStudy: z.string().min(1).max(120),
    startYear: yearField.nullable().optional(),
    endYear: yearField.nullable().optional(),
    gpa: z.number().min(0).max(5).nullable().optional(),
    honors: z.string().max(200).nullable().optional(),
    activities: z.string().max(5000).nullable().optional(),
    order: orderField,
  })
  .superRefine((val, ctx) => {
    if (
      val.startYear != null &&
      val.endYear != null &&
      val.endYear < val.startYear
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endYear must be on or after startYear",
        path: ["endYear"],
      });
    }
    if (!val.universityId && !val.schoolName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either universityId or schoolName is required",
        path: ["schoolName"],
      });
    }
  });
const educationEntryObject = z.object({
  universityId: z.string().cuid().nullable().optional(),
  schoolName: z.string().max(200).nullable().optional(),
  degree: z.string().min(1).max(120),
  fieldOfStudy: z.string().min(1).max(120),
  startYear: yearField.nullable().optional(),
  endYear: yearField.nullable().optional(),
  gpa: z.number().min(0).max(5).nullable().optional(),
  honors: z.string().max(200).nullable().optional(),
  activities: z.string().max(5000).nullable().optional(),
  order: orderField,
});
export const educationEntryUpdateSchema = educationEntryObject
  .partial()
  .superRefine((val, ctx) => {
    if (
      val.startYear != null &&
      val.endYear != null &&
      val.endYear < val.startYear
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endYear must be on or after startYear",
        path: ["endYear"],
      });
    }
  });

// Project ────────────────────────────────────────────────────────────────
export const projectSchema = z
  .object({
    name: z.string().min(1).max(200),
    url: urlOrEmpty,
    repoUrl: urlOrEmpty,
    description: z.string().max(5000).nullable().optional(),
    technologies: z
      .array(z.string().min(1).max(60))
      .max(50)
      .default([]),
    role: z.string().max(120).nullable().optional(),
    startDate: z.coerce.date().nullable().optional(),
    endDate: z.coerce.date().nullable().optional(),
    isOngoing: z.boolean().default(false),
    order: orderField,
  })
  .superRefine((val, ctx) => {
    if (val.isOngoing && val.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endDate must be null when isOngoing is true",
        path: ["endDate"],
      });
    }
    if (val.startDate && val.endDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endDate must be on or after startDate",
        path: ["endDate"],
      });
    }
  });
const projectObject = z.object({
  name: z.string().min(1).max(200),
  url: urlOrEmpty,
  repoUrl: urlOrEmpty,
  description: z.string().max(5000).nullable().optional(),
  technologies: z.array(z.string().min(1).max(60)).max(50),
  role: z.string().max(120).nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  isOngoing: z.boolean(),
  order: orderField,
});
export const projectUpdateSchema = projectObject
  .partial()
  .superRefine((val, ctx) => {
    if (val.isOngoing === true && val.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endDate must be null when isOngoing is true",
        path: ["endDate"],
      });
    }
    if (val.startDate && val.endDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endDate must be on or after startDate",
        path: ["endDate"],
      });
    }
  });

// Certification ─────────────────────────────────────────────────────────
export const certificationSchema = z
  .object({
    name: z.string().min(1).max(200),
    issuer: z.string().min(1).max(200),
    issueDate: z.coerce.date().nullable().optional(),
    expiryDate: z.coerce.date().nullable().optional(),
    credentialUrl: urlOrEmpty,
    credentialId: z.string().max(200).nullable().optional(),
    order: orderField,
  })
  .superRefine((val, ctx) => {
    if (val.issueDate && val.expiryDate && val.expiryDate < val.issueDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expiryDate must be on or after issueDate",
        path: ["expiryDate"],
      });
    }
  });
const certificationObject = z.object({
  name: z.string().min(1).max(200),
  issuer: z.string().min(1).max(200),
  issueDate: z.coerce.date().nullable().optional(),
  expiryDate: z.coerce.date().nullable().optional(),
  credentialUrl: urlOrEmpty,
  credentialId: z.string().max(200).nullable().optional(),
  order: orderField,
});
export const certificationUpdateSchema = certificationObject
  .partial()
  .superRefine((val, ctx) => {
    if (val.issueDate && val.expiryDate && val.expiryDate < val.issueDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expiryDate must be on or after issueDate",
        path: ["expiryDate"],
      });
    }
  });

// SpokenLanguage ────────────────────────────────────────────────────────
export const spokenLanguageSchema = z.object({
  name: z.string().min(1).max(80),
  proficiency: z.enum(LANGUAGE_PROFICIENCIES),
  order: orderField,
});
export const spokenLanguageUpdateSchema = spokenLanguageSchema.partial();
