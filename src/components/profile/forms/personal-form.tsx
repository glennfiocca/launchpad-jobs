"use client";

/**
 * PersonalForm — Direction A reference implementation.
 *
 * The other 6 parallel tab agents will copy this pattern. Things worth
 * preserving when other tabs are migrated:
 *
 *  - SectionHeader pair (eyebrow + display title + optional right slot)
 *  - directionAInputClass on every field (lavender focus ring, 12px radius)
 *  - directionASectionClass on every section card (14px radius hairline)
 *  - SavedPill in the section header that lights up on successful save
 *  - Single submit button using primaryWhiteBtnClass; no inline save state
 *    on individual fields for tabs that don't use list-editor (Personal,
 *    Professional, Preferences — these still patch on form submit so they
 *    can validate the whole form server-side as one shot).
 *  - 13 social URLs split: top tier (LinkedIn / GitHub / X / Portfolio)
 *    separated by a subtle hairline from "the rest." Portfolio sits in the
 *    top tier visually but is labeled explicitly as "personal website or
 *    portfolio" so users understand the field.
 *
 * Identity fields (firstName / lastName / email) are required by the API.
 * Phone is included to match the per-section completion rubric (counted as
 * 1 of 6 personal contributors).
 */

import { useCallback, useState } from "react";
import type { UserProfile } from "@prisma/client";
import { AddressCombobox } from "@/components/ui/address-combobox";
import type { PlaceDetails } from "@/lib/validations/places";
import {
  directionAInputClass,
  directionASectionClass,
  gridThreeCol,
  gridTwoCol,
  labelClass,
} from "./_shared/styles";
import {
  FormEyebrow,
  SavedPill,
  SectionHeader,
} from "./_shared/atoms";
import { useDebouncedProfileSave } from "./_shared/use-debounced-profile-save";

// Runtime-vs-generated-type bridge — these structured location columns exist
// in the DB even before the Prisma client regen reflects them.
type ProfileWithStructured =
  | (UserProfile & {
      locationPlaceId?: string | null;
      locationFormatted?: string | null;
      locationStreet?: string | null;
      locationCity?: string | null;
      locationState?: string | null;
      locationPostalCode?: string | null;
      locationLat?: number | null;
      locationLng?: number | null;
    })
  | null;

interface PersonalFormState {
  firstName: string;
  lastName: string;
  preferredFirstName: string;
  email: string;
  phone: string;
  location: string;
  locationPlaceId: string;
  locationFormatted: string;
  locationStreet: string;
  locationCity: string;
  locationState: string;
  locationPostalCode: string;
  locationLat: string;
  locationLng: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  twitterUrl: string;
  stackOverflowUrl: string;
  kaggleUrl: string;
  huggingFaceUrl: string;
  mediumUrl: string;
  devToUrl: string;
  dribbbleUrl: string;
  behanceUrl: string;
  googleScholarUrl: string;
  youtubeUrl: string;
}

type UrlField = Exclude<
  keyof PersonalFormState,
  | "firstName"
  | "lastName"
  | "preferredFirstName"
  | "email"
  | "phone"
  | "location"
  | "locationPlaceId"
  | "locationFormatted"
  | "locationStreet"
  | "locationCity"
  | "locationState"
  | "locationPostalCode"
  | "locationLat"
  | "locationLng"
>;

interface UrlFieldConfig {
  readonly key: UrlField;
  readonly label: string;
  readonly placeholder: string;
}

// Top-tier socials sit above a hairline divider. Portfolio is here for
// visual prominence but its label is explicit so users know it's the
// "personal website" field rather than a specific service.
const TOP_TIER_SOCIALS: ReadonlyArray<UrlFieldConfig> = [
  {
    key: "linkedinUrl",
    label: "LinkedIn",
    placeholder: "https://linkedin.com/in/yourname",
  },
  {
    key: "githubUrl",
    label: "GitHub",
    placeholder: "https://github.com/yourname",
  },
  {
    key: "twitterUrl",
    label: "X / Twitter",
    placeholder: "https://x.com/yourname",
  },
  {
    key: "portfolioUrl",
    label: "Your personal website or portfolio",
    placeholder: "https://yoursite.com",
  },
];

const OTHER_SOCIALS: ReadonlyArray<UrlFieldConfig> = [
  {
    key: "stackOverflowUrl",
    label: "Stack Overflow",
    placeholder: "https://stackoverflow.com/users/123/yourname",
  },
  {
    key: "kaggleUrl",
    label: "Kaggle",
    placeholder: "https://kaggle.com/yourname",
  },
  {
    key: "huggingFaceUrl",
    label: "Hugging Face",
    placeholder: "https://huggingface.co/yourname",
  },
  {
    key: "mediumUrl",
    label: "Medium",
    placeholder: "https://medium.com/@yourname",
  },
  {
    key: "devToUrl",
    label: "Dev.to",
    placeholder: "https://dev.to/yourname",
  },
  {
    key: "dribbbleUrl",
    label: "Dribbble",
    placeholder: "https://dribbble.com/yourname",
  },
  {
    key: "behanceUrl",
    label: "Behance",
    placeholder: "https://behance.net/yourname",
  },
  {
    key: "googleScholarUrl",
    label: "Google Scholar",
    placeholder: "https://scholar.google.com/citations?user=...",
  },
  {
    key: "youtubeUrl",
    label: "YouTube",
    placeholder: "https://youtube.com/@yourname",
  },
];

function initState(data: ProfileWithStructured): PersonalFormState {
  return {
    firstName: data?.firstName ?? "",
    lastName: data?.lastName ?? "",
    preferredFirstName: data?.preferredFirstName ?? "",
    email: data?.email ?? "",
    phone: data?.phone ?? "",
    location: data?.locationFormatted ?? data?.location ?? "",
    locationPlaceId: data?.locationPlaceId ?? "",
    locationFormatted: data?.locationFormatted ?? "",
    locationStreet: data?.locationStreet ?? "",
    locationCity: data?.locationCity ?? "",
    locationState: data?.locationState ?? "",
    locationPostalCode: data?.locationPostalCode ?? "",
    locationLat: data?.locationLat?.toString() ?? "",
    locationLng: data?.locationLng?.toString() ?? "",
    linkedinUrl: data?.linkedinUrl ?? "",
    githubUrl: data?.githubUrl ?? "",
    portfolioUrl: data?.portfolioUrl ?? "",
    twitterUrl: data?.twitterUrl ?? "",
    stackOverflowUrl: data?.stackOverflowUrl ?? "",
    kaggleUrl: data?.kaggleUrl ?? "",
    huggingFaceUrl: data?.huggingFaceUrl ?? "",
    mediumUrl: data?.mediumUrl ?? "",
    devToUrl: data?.devToUrl ?? "",
    dribbbleUrl: data?.dribbbleUrl ?? "",
    behanceUrl: data?.behanceUrl ?? "",
    googleScholarUrl: data?.googleScholarUrl ?? "",
    youtubeUrl: data?.youtubeUrl ?? "",
  };
}

interface PersonalFormProps {
  initialData: UserProfile | null;
}

export function PersonalForm({ initialData }: PersonalFormProps) {
  const [form, setForm] = useState<PersonalFormState>(initState(initialData));

  // Debounced PUT /api/profile fired from every field's onBlur (text) or
  // onChange (selects, address picker). Coalesces rapid edits into one PUT.
  // Best-effort unmount flush so navigating away mid-edit doesn't lose data.
  const buildPersonalPayload = useCallback(
    () => ({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      preferredFirstName: form.preferredFirstName || undefined,
      phone: form.phone || undefined,
      location: form.location || undefined,
      locationPlaceId: form.locationPlaceId || undefined,
      locationFormatted: form.locationFormatted || undefined,
      locationStreet: form.locationStreet || undefined,
      locationCity: form.locationCity || undefined,
      locationState: form.locationState || undefined,
      locationPostalCode: form.locationPostalCode || undefined,
      locationLat: form.locationLat ? Number(form.locationLat) : undefined,
      locationLng: form.locationLng ? Number(form.locationLng) : undefined,
      linkedinUrl: form.linkedinUrl,
      githubUrl: form.githubUrl,
      portfolioUrl: form.portfolioUrl,
      twitterUrl: form.twitterUrl,
      stackOverflowUrl: form.stackOverflowUrl,
      kaggleUrl: form.kaggleUrl,
      huggingFaceUrl: form.huggingFaceUrl,
      mediumUrl: form.mediumUrl,
      devToUrl: form.devToUrl,
      dribbbleUrl: form.dribbbleUrl,
      behanceUrl: form.behanceUrl,
      googleScholarUrl: form.googleScholarUrl,
      youtubeUrl: form.youtubeUrl,
    }),
    [form],
  );

  const { schedule, saving, recentlySaved } =
    useDebouncedProfileSave(buildPersonalPayload);

  // Every local-state update also schedules a debounced save — the user gets
  // blur-to-save UX on every field with no per-input wiring.
  const set = (field: keyof PersonalFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    schedule();
  };

  return (
    <div className="space-y-6">
      {/* Identity section */}
      <section className={directionASectionClass}>
        <SectionHeader
          eyebrow={<FormEyebrow accent>identity · required</FormEyebrow>}
          title="Personal Information"
          subtitle="The basics that go on every application — name, contact, where you're based."
          right={<SavedPill visible={recentlySaved} />}
        />

        <div className={gridTwoCol}>
          <div>
            <label className={labelClass}>First Name *</label>
            <input
              className={directionAInputClass}
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              required
              placeholder="Jane"
            />
          </div>
          <div>
            <label className={labelClass}>Last Name *</label>
            <input
              className={directionAInputClass}
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              required
              placeholder="Doe"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>
            Preferred First Name{" "}
            <span className="text-text-dim font-normal">
              (optional — used on applications that ask for a preferred name)
            </span>
          </label>
          <input
            className={directionAInputClass}
            value={form.preferredFirstName}
            onChange={(e) => set("preferredFirstName", e.target.value)}
            placeholder="e.g. Alex (if different from your legal first name)"
          />
        </div>

        <div className={gridTwoCol}>
          <div>
            <label className={labelClass}>Email *</label>
            <input
              className={`${directionAInputClass} font-mono`}
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              required
              placeholder="jane@example.com"
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              className={`${directionAInputClass} font-mono`}
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+1 (555) 000-0000"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Address</label>
          <AddressCombobox
            value={form.location}
            onChange={(display) => set("location", display)}
            onSelect={(details: PlaceDetails) => {
              setForm((prev) => ({
                ...prev,
                location: details.formattedAddress,
                locationPlaceId: details.placeId,
                locationFormatted: details.formattedAddress,
                locationStreet: details.street ?? "",
                locationCity: details.city ?? "",
                locationState: details.state ?? "",
                locationPostalCode: details.postalCode ?? "",
                locationLat: details.lat?.toString() ?? "",
                locationLng: details.lng?.toString() ?? "",
              }));
              // Multi-field setForm bypasses `set()`, so schedule manually.
              schedule();
            }}
            placeholder="San Francisco, CA"
          />
        </div>
      </section>

      {/* Social links — top tier (LinkedIn / GitHub / X / Portfolio) above
          the rest. Always visible; no more accordion (the redesign treats
          this as part of the personal artifact, not a collapsed extra). */}
      <section className={directionASectionClass}>
        <SectionHeader
          eyebrow={<FormEyebrow>optional · used for autofill</FormEyebrow>}
          title="Social Links"
          subtitle="Top four feed straight into your job application autofills. The rest tile underneath for discoverability."
        />

        <div className={gridTwoCol}>
          {TOP_TIER_SOCIALS.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className={labelClass}>{label}</label>
              <input
                className={`${directionAInputClass} font-mono`}
                type="url"
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>

        {/* Hairline separator between the top tier and the rest. */}
        <div className="border-t border-white/[0.06] pt-4 mt-2">
          <FormEyebrow>more · social, writing, design, research</FormEyebrow>
          <div className={`${gridThreeCol} mt-3`}>
            {OTHER_SOCIALS.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className={labelClass}>{label}</label>
                <input
                  className={`${directionAInputClass} font-mono`}
                  type="url"
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={placeholder}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live save indicator — replaces the explicit Save button. Saves fire
          on every field change via the debounced scheduler. */}
      {saving && (
        <div className="flex items-center justify-end">
          <FormEyebrow>saving…</FormEyebrow>
        </div>
      )}
    </div>
  );
}
