import type { UserProfile } from "@prisma/client";

// PUT /api/profile validates a Zod schema that REQUIRES firstName, lastName, email.
// Per-tab forms only edit a slice of fields, so on submit we merge the slice with
// these required identity fields pulled from initialData (or the slice itself, in
// the Personal tab's case).
//
// All optional fields are passed through as-is; the API does an upsert and stores
// only the keys present in the payload, so untouched fields aren't clobbered as
// long as they aren't included.
export interface IdentityBase {
  firstName: string;
  lastName: string;
  email: string;
}

export function getIdentityBase(initialData: UserProfile | null): IdentityBase {
  return {
    firstName: initialData?.firstName ?? "",
    lastName: initialData?.lastName ?? "",
    email: initialData?.email ?? "",
  };
}

// Build a payload by merging an identity base with a tab-scoped slice.
// Slices win on conflict (so the Personal tab can update firstName/lastName/email).
export function buildPayload<T extends Partial<IdentityBase> & Record<string, unknown>>(
  identity: IdentityBase,
  slice: T
): IdentityBase & T {
  return { ...identity, ...slice };
}

export interface SubmitResult {
  ok: boolean;
  error?: string;
}

export async function submitProfilePatch(payload: unknown): Promise<SubmitResult> {
  try {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Failed to save profile" };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Network error — please check your connection and try again.",
    };
  }
}
