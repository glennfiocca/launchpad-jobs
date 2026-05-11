// Shared Prisma `include` for EducationEntry responses. Joining a thin slice
// of the related University row lets the UI render the linked school's display
// name without a second round-trip. Kept colocated with the routes so any
// change to the joined shape touches one file.

export const EDUCATION_ENTRY_INCLUDE = {
  university: {
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
    },
  },
} as const;

// Mirrors the slice selected by EDUCATION_ENTRY_INCLUDE. Surfaced as a public
// type so the form can type its rows without importing Prisma client types.
export interface EducationEntryUniversitySummary {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}
