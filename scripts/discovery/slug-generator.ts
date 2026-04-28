/**
 * Generates candidate Greenhouse board token slugs from company names.
 * Tokens are typically lowercase company name slugs with no spaces.
 */

const SUFFIXES_TO_STRIP = [
  // Corporate suffixes
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "limited",
  "llc",
  "llp",
  "plc",
  "ag",
  "sa",
  "gmbh",
  "nv",
  "se",
  "group",
  "holdings",
  "holding",
  "technologies",
  "technology",
  "solutions",
  "services",
  "enterprises",
  "international",
  "global",
];

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[&+]/g, "and")
    .replace(/\./g, "")
    .trim();
}

function stripSuffixes(words: readonly string[]): readonly string[] {
  const result = [...words];
  // Strip trailing suffix words (up to 2)
  for (let i = 0; i < 2 && result.length > 1; i++) {
    const last = result[result.length - 1];
    if (SUFFIXES_TO_STRIP.includes(last)) {
      result.pop();
    } else {
      break;
    }
  }
  return result;
}

function toAlphanumericWords(text: string): readonly string[] {
  return text
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/[\s-]+/)
    .filter((w) => w.length > 0);
}

export function generateSlugs(companyName: string): readonly string[] {
  const normalized = normalize(companyName);
  const allWords = toAlphanumericWords(normalized);

  if (allWords.length === 0) return [];

  const coreWords = stripSuffixes(allWords);
  const slugs = new Set<string>();

  // 1. Joined (no separator): "paloaltonetworks"
  slugs.add(coreWords.join(""));

  // 2. Hyphenated: "palo-alto-networks"
  if (coreWords.length > 1) {
    slugs.add(coreWords.join("-"));
  }

  // 3. First word only (if multi-word): "paloalto" -> just first word
  if (coreWords.length > 1) {
    slugs.add(coreWords[0]);
  }

  // 4. Full name with suffixes (in case the token includes them)
  if (allWords.join("") !== coreWords.join("")) {
    slugs.add(allWords.join(""));
  }

  // 5. First two words joined (common pattern): "paloalto"
  if (coreWords.length > 2) {
    slugs.add(coreWords.slice(0, 2).join(""));
  }

  // Remove empty strings
  slugs.delete("");

  return [...slugs];
}

/**
 * Generate slugs for a batch of company names.
 * Returns deduplicated slug -> company name mapping.
 */
export function generateSlugBatch(
  companies: readonly string[]
): ReadonlyMap<string, string> {
  const slugToCompany = new Map<string, string>();

  for (const company of companies) {
    const slugs = generateSlugs(company);
    for (const slug of slugs) {
      // First company to claim a slug wins
      if (!slugToCompany.has(slug)) {
        slugToCompany.set(slug, company);
      }
    }
  }

  return slugToCompany;
}
