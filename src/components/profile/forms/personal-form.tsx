"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import { AddressCombobox } from "@/components/ui/address-combobox";
import type { PlaceDetails } from "@/lib/validations/places";
import { inputClass, labelClass, sectionClass, sectionTitleClass } from "./_shared/styles";
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
}

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
  };
}

interface PersonalFormProps {
  initialData: UserProfile | null;
}

export function PersonalForm({ initialData }: PersonalFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<PersonalFormState>(initState(initialData));
  const [saving, setSaving] = useState(false);

  const set = (field: keyof PersonalFormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // Personal tab IS the source of truth for identity fields.
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
        <div className="grid grid-cols-2 gap-4">
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
        <div className="grid grid-cols-2 gap-4">
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

      <SaveButton saving={saving} />
    </form>
  );
}
