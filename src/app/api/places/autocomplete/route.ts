import { NextResponse } from "next/server";
import { placesAutocompleteQuerySchema } from "@/lib/validations/places";
import type { PlaceSuggestion } from "@/lib/validations/places";
import type { ApiResponse } from "@/types";

const GOOGLE_API_BASE = "https://maps.googleapis.com/maps/api/place/autocomplete/json";

export async function GET(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Places API not configured" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = placesAutocompleteQuerySchema.safeParse(
    Object.fromEntries(searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid query parameters" },
      { status: 400 }
    );
  }

  const { q, mode, sessionToken } = parsed.data;
  // mode=profile → street-level address; mode=jobs → cities only
  const types = mode === "profile" ? "address" : "(cities)";

  const url = new URL(GOOGLE_API_BASE);
  url.searchParams.set("input", q);
  url.searchParams.set("types", types);
  url.searchParams.set("components", "country:us");
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
      predictions: Array<{
        place_id: string;
        description: string;
        structured_formatting: {
          main_text: string;
          secondary_text: string;
        };
      }>;
    };

    if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: `Places API error: ${json.status}` },
        { status: 502 }
      );
    }

    const suggestions: PlaceSuggestion[] = (json.predictions ?? []).map((p) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text ?? p.description,
      secondaryText: p.structured_formatting?.secondary_text ?? "",
    }));

    return NextResponse.json<ApiResponse<PlaceSuggestion[]>>({
      success: true,
      data: suggestions,
    });
  } catch {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to fetch place suggestions" },
      { status: 500 }
    );
  }
}
