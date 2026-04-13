export const EEOC_GENDER: Record<string, string> = {
  "Male": "1",
  "Female": "2",
  "Decline To Self Identify": "3",
};

export const EEOC_RACE: Record<string, string> = {
  "American Indian or Alaskan Native": "1",
  "Asian": "2",
  "Black or African American": "3",
  "Hispanic or Latino": "4",
  "White": "5",
  "Native Hawaiian or Other Pacific Islander": "6",
  "Two or More Races": "7",
  "Decline To Self Identify": "8",
};

export const EEOC_VETERAN: Record<string, string> = {
  "I am not a protected veteran": "1",
  "I identify as one or more of the classifications of a protected veteran": "2",
  "I don't wish to answer": "3",
};

export const EEOC_DISABILITY: Record<string, string> = {
  "Yes, I have a disability, or have had one in the past": "1",
  "No, I do not have a disability and have not had one in the past": "2",
  "I do not want to answer": "3",
};

export function resolveEeocFields(profile: {
  voluntaryGender?: string | null;
  voluntaryRace?: string | null;
  voluntaryVeteranStatus?: string | null;
  voluntaryDisability?: string | null;
}): Record<string, string> {
  const result: Record<string, string> = {};
  if (profile.voluntaryGender) {
    const v = EEOC_GENDER[profile.voluntaryGender];
    if (v) result.gender = v;
  }
  if (profile.voluntaryRace) {
    const v = EEOC_RACE[profile.voluntaryRace];
    if (v) result.race = v;
  }
  if (profile.voluntaryVeteranStatus) {
    const v = EEOC_VETERAN[profile.voluntaryVeteranStatus];
    if (v) result.veteran_status = v;
  }
  if (profile.voluntaryDisability) {
    const v = EEOC_DISABILITY[profile.voluntaryDisability];
    if (v) result.disability_status = v;
  }
  return result;
}
