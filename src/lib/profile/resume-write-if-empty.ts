import { db } from "@/lib/db";

import type { ExtractedResumeData } from "./resume-types";

/**
 * Writes Haiku-extracted scalars back to UserProfile columns, but only when
 * the existing column value is null/empty. Never overwrites user-entered
 * data — this is opportunistic auto-fill on first upload, not a sync.
 *
 * Per the locked Q2 spec, ONLY scalar columns on UserProfile are touched.
 * Skills and educationEntries stay as a JSONB snapshot in
 * `UserProfile.resumeExtracted` — the child tables (`Skill`,
 * `EducationEntry`) remain the user's curated source of truth.
 *
 * Returns the list of column names actually written so the SSE stream can
 * surface "we auto-filled X, Y, Z" to the user.
 */

interface BackfillResult {
  written: string[];
}

function isEmptyString(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

export async function backfillProfileFromExtracted(
  profileId: string,
  extracted: ExtractedResumeData,
): Promise<BackfillResult> {
  const profile = await db.userProfile.findUnique({
    where: { id: profileId },
    select: {
      currentTitle: true,
      currentCompany: true,
      yearsExperience: true,
      summary: true,
    },
  });

  if (!profile) {
    // Caller invariant — the profile must exist when the upload route reaches
    // this helper. Surfacing the missing row as an explicit Error (rather
    // than silently writing nothing) keeps the SSE stream honest.
    throw new Error(`UserProfile ${profileId} not found`);
  }

  // Build a partial update payload, populating only the keys whose current
  // value is empty AND the extracted side has something to contribute.
  // Mirrors the locked Q2 spec — write-if-empty semantics, never overwrite.
  const update: {
    currentTitle?: string;
    currentCompany?: string;
    yearsExperience?: number;
    summary?: string;
  } = {};
  const written: string[] = [];

  if (isEmptyString(profile.currentTitle) && extracted.currentTitle) {
    update.currentTitle = extracted.currentTitle;
    written.push("currentTitle");
  }

  if (isEmptyString(profile.currentCompany) && extracted.mostRecentCompany) {
    update.currentCompany = extracted.mostRecentCompany;
    written.push("currentCompany");
  }

  if (profile.yearsExperience == null && extracted.yearsExperience != null) {
    update.yearsExperience = extracted.yearsExperience;
    written.push("yearsExperience");
  }

  if (isEmptyString(profile.summary) && extracted.summary) {
    update.summary = extracted.summary;
    written.push("summary");
  }

  if (written.length === 0) {
    return { written };
  }

  await db.userProfile.update({
    where: { id: profileId },
    data: update,
  });

  return { written };
}
