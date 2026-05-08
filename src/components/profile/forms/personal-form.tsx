"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import { AddressCombobox } from "@/components/ui/address-combobox";
import type { PlaceDetails } from "@/lib/validations/places";
import {
  gridThreeCol,
  gridTwoCol,
  inputClass,
  labelClass,
  sectionClass,
  sectionTitleClass,
} from "./_shared/styles";
import { SaveButton } from "./_shared/save-button";
import { submitProfilePatch } from "./_shared/submit";

// Same runtime-vs-generated-type bridge used in the original profile-form.tsx —
// these structured location columns exist at runtime even before the Prisma
// client regen reflects them.
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
  // Social / professional URLs (10 new + 3 existing). Stored on the personal
  // tab because they're identity-attached profile metadata, not job-search prefs.
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

// URL field groups for the Social Links collapsible section. Order within each
// group is the rendered order; group-name is the subheader label.
type UrlField = Exclude<keyof PersonalFormState,
  | "firstName" | "lastName" | "preferredFirstName" | "email" | "phone"
  | "location" | "locationPlaceId" | "locationFormatted" | "locationStreet"
  | "locationCity" | "locationState" | "locationPostalCode" | "locationLat" | "locationLng">;

const SOCIAL_GROUPS: ReadonlyArray<{
  title: string;
  fields: ReadonlyArray<{ key: UrlField; label: string; placeholder: string }>;
}> = [
  {
    title: "Code",
    fields: [
      { key: "githubUrl", label: "GitHub", placeholder: "https://github.com/yourname" },
      { key: "stackOverflowUrl", label: "Stack Overflow", placeholder: "https://stackoverflow.com/users/123/yourname" },
      { key: "kaggleUrl", label: "Kaggle", placeholder: "https://kaggle.com/yourname" },
      { key: "huggingFaceUrl", label: "Hugging Face", placeholder: "https://huggingface.co/yourname" },
    ],
  },
  {
    title: "Writing",
    fields: [
      { key: "mediumUrl", label: "Medium", placeholder: "https://medium.com/@yourname" },
      { key: "devToUrl", label: "Dev.to", placeholder: "https://dev.to/yourname" },
    ],
  },
  {
    title: "Design",
    fields: [
      { key: "dribbbleUrl", label: "Dribbble", placeholder: "https://dribbble.com/yourname" },
      { key: "behanceUrl", label: "Behance", placeholder: "https://behance.net/yourname" },
    ],
  },
  {
    title: "Research",
    fields: [
      { key: "googleScholarUrl", label: "Google Scholar", placeholder: "https://scholar.google.com/citations?user=..." },
    ],
  },
  {
    title: "Social",
    fields: [
      { key: "linkedinUrl", label: "LinkedIn", placeholder: "https://linkedin.com/in/yourname" },
      { key: "twitterUrl", label: "Twitter / X", placeholder: "https://twitter.com/yourname" },
      { key: "youtubeUrl", label: "YouTube", placeholder: "https://youtube.com/@yourname" },
      { key: "portfolioUrl", label: "Portfolio / Website", placeholder: "https://yoursite.com" },
    ],
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
  const router = useRouter();
  const [form, setForm] = useState<PersonalFormState>(initState(initialData));
  const [saving, setSaving] = useState(false);
  const [socialLinksOpen, setSocialLinksOpen] = useState(false);

  const set = (field: keyof PersonalFormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // Personal tab IS the source of truth for identity fields. Social URLs are
    // sent as "" rather than undefined so the API's "" → null normalizer can
    // clear them on the server when the user empties an input.
    const payload = {
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
    };

    const result = await submitProfilePatch(payload);
    if (!result.ok) {
      toast.error(result.error ?? "Failed to save profile");
    } else {
      toast.success("Profile saved successfully!");
      router.refresh();
    }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Personal Information</h2>
        <div className={gridTwoCol}>
          <div>
            <label className={labelClass}>First Name *</label>
            <input
              className={inputClass}
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              required
              placeholder="Jane"
            />
          </div>
          <div>
            <label className={labelClass}>Last Name *</label>
            <input
              className={inputClass}
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
            <span className="text-zinc-600 font-normal">
              (optional — used on applications that ask for a preferred name)
            </span>
          </label>
          <input
            className={inputClass}
            value={form.preferredFirstName}
            onChange={(e) => set("preferredFirstName", e.target.value)}
            placeholder="e.g. Alex (if different from your legal first name)"
          />
        </div>
        <div className={gridTwoCol}>
          <div>
            <label className={labelClass}>Email *</label>
            <input
              className={inputClass}
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
              className={inputClass}
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
            }}
            placeholder="San Francisco, CA"
          />
        </div>
      </div>

      <details className={sectionClass} open={socialLinksOpen}>
        <summary
          className="cursor-pointer list-none flex items-center justify-between"
          onClick={(e) => {
            e.preventDefault();
            setSocialLinksOpen((v) => !v);
          }}
        >
          <h2 className={`${sectionTitleClass} mb-0`}>Social Links</h2>
          <span className="text-xs text-zinc-500">{socialLinksOpen ? "Hide" : "Show"}</span>
        </summary>
        <p className="text-xs text-zinc-500 -mt-1">
          Optional — used to autofill applications and link from your public profile.
        </p>
        {SOCIAL_GROUPS.map((group) => (
          <div key={group.title} className="space-y-3 pt-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              {group.title}
            </p>
            <div className={gridThreeCol}>
              {group.fields.map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className={labelClass}>{label}</label>
                  <input
                    className={inputClass}
                    type="url"
                    value={form[key]}
                    onChange={(e) => set(key, e.target.value)}
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </details>

      <SaveButton saving={saving} />
    </form>
  );
}
