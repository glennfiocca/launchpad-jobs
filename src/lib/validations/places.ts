import { z } from "zod";

export const placesAutocompleteQuerySchema = z.object({
  q: z.string().min(1).max(200),
  mode: z.enum(["profile", "jobs"]),
  sessionToken: z.string().optional(),
});

export const placesDetailsQuerySchema = z.object({
  placeId: z.string().min(1),
  mode: z.enum(["profile", "jobs"]),
  sessionToken: z.string().optional(),
});

export const universitiesQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetails {
  placeId: string;
  formattedAddress: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
}

export interface UniversitySuggestion {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}
