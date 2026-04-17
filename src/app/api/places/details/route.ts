import { NextResponse } from "next/server";
import { placesDetailsQuerySchema } from "@/lib/validations/places";
import type { PlaceDetails } from "@/lib/validations/places";
import type { ApiResponse } from "@/types";

const GOOGLE_API_BASE = "https://maps.googleapis.com/maps/api/place/details/json";

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

function extractComponent(
  components: AddressComponent[],
  type: string,
  useShort = false
): string | null {
  const found = components.find((c) => c.types.includes(type));
  return found ? (useShort ? found.short_name : found.long_name) : null;
}

export async function GET(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Places API not configured" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = placesDetailsQuerySchema.safeParse(
    Object.fromEntries(searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid query parameters" },
      { status: 400 }
    );
  }

  const { placeId, mode, sessionToken } = parsed.data;

  // Profile needs full address including geometry; jobs only need city+state
  const fields =
    mode === "profile"
      ? "formatted_address,address_components,geometry"
      : "formatted_address,address_components";

  const url = new URL(GOOGLE_API_BASE);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", fields);
  url.searchParams.set("key", apiKey);
  if (sessionToken) url.searchParams.set("sessiontoken", sessionToken);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Places API upstream error" },
        { status: 502 }
      );
    }

    const json = await res.json() as {
      status: string;
      result?: {
        formatted_address?: string;
        address_components?: AddressComponent[];
        geometry?: { location: { lat: number; lng: number } };
      };
    };

    if (json.status !== "OK" || !json.result) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: `Places API error: ${json.status}` },
        { status: 502 }
      );
    }

    const components = json.result.address_components ?? [];
    const streetNumber = extractComponent(components, "street_number");
    const streetName = extractComponent(components, "route");
    const street =
      streetNumber && streetName
        ? `${streetNumber} ${streetName}`
        : streetName ?? null;

    const details: PlaceDetails = {
      placeId,
      formattedAddress: json.result.formatted_address ?? "",
      street,
      city:
        extractComponent(components, "locality") ??
        extractComponent(components, "sublocality") ??
        null,
      state: extractComponent(components, "administrative_area_level_1", true),
      postalCode: extractComponent(components, "postal_code"),
      lat: json.result.geometry?.location.lat ?? null,
      lng: json.result.geometry?.location.lng ?? null,
    };

    return NextResponse.json<ApiResponse<PlaceDetails>>({
      success: true,
      data: details,
    });
  } catch {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to fetch place details" },
      { status: 500 }
    );
  }
}
