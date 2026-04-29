/**
 * Raw Ashby Posting API response types.
 * These mirror the public API shapes — NOT the normalized ATS types.
 */

export interface AshbyPostalAddress {
  readonly addressLocality: string;
  readonly addressRegion: string;
  readonly addressCountry: string;
}

export interface AshbyAddress {
  readonly postalAddress: AshbyPostalAddress;
}

export interface AshbySecondaryLocation {
  readonly location: string;
  readonly address: AshbyAddress;
}

export interface AshbyCompensationComponent {
  readonly compensationType: string; // "Salary", etc.
  readonly currencyCode: string | null;
  readonly minValue: number | null;
  readonly maxValue: number | null;
}

export interface AshbyCompensationTier {
  readonly title: string;
  readonly components: ReadonlyArray<AshbyCompensationComponent>;
}

export interface AshbyCompensation {
  readonly compensationTierSummary: string;
  readonly scrapeableCompensationSalarySummary: string;
  readonly compensationTiers: ReadonlyArray<AshbyCompensationTier>;
}

export interface AshbyApiJob {
  readonly id: string; // UUID
  readonly title: string;
  readonly department: string;
  readonly team: string;
  readonly employmentType: string; // "FullTime" | "PartTime" | "Intern" | "Contract" | "Temporary"
  readonly location: string;
  readonly secondaryLocations: ReadonlyArray<AshbySecondaryLocation>;
  readonly address: AshbyAddress;
  readonly isRemote: boolean;
  readonly isListed: boolean;
  readonly workplaceType: string; // "Remote" | "OnSite" | "Hybrid"
  readonly descriptionHtml: string;
  readonly descriptionPlain: string;
  readonly publishedAt: string; // ISO 8601
  readonly jobUrl: string;
  readonly applyUrl: string;
  readonly shouldDisplayCompensationOnJobPostings?: boolean;
  readonly compensation?: AshbyCompensation;
}

export interface AshbyApiResponse {
  readonly jobs: ReadonlyArray<AshbyApiJob>;
  readonly apiVersion: string;
}

// ---------------------------------------------------------------------------
// GraphQL application-form types (non-user-graphql endpoint)
// ---------------------------------------------------------------------------

/** Ashby field types returned by the GraphQL API */
export type AshbyFieldType =
  | "String"
  | "Email"
  | "Phone"
  | "LongText"
  | "File"
  | "Boolean"
  | "ValueSelect"
  | "MultiValueSelect"
  | "Location"
  | "Number"
  | "Date"
  | "SocialLink";

export interface AshbySelectableValue {
  readonly label: string;
  readonly value: string;
}

export interface AshbyFormField {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly type: AshbyFieldType;
  readonly isNullable: boolean;
  readonly selectableValues?: ReadonlyArray<AshbySelectableValue>;
}

export interface AshbyFieldEntry {
  readonly id: string;
  readonly field: AshbyFormField;
  readonly isRequired: boolean;
  readonly isHidden: boolean | null;
  readonly descriptionHtml: string | null;
}

export interface AshbyFormSection {
  readonly fieldEntries: ReadonlyArray<AshbyFieldEntry>;
}

export interface AshbyApplicationForm {
  readonly id: string;
  readonly sourceFormDefinitionId: string;
  readonly sections: ReadonlyArray<AshbyFormSection>;
}

export interface AshbyGraphQLResponse {
  readonly data: {
    readonly jobPosting: {
      readonly applicationForm: AshbyApplicationForm | null;
    } | null;
  } | null;
  readonly errors?: ReadonlyArray<{ readonly message: string }>;
}
