import { z } from "zod";
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from "@/lib/settings/constants";

// Pulled out of identity-form.tsx so unit tests can import the schema
// without dragging in `react-hook-form`, `next-auth/react`, etc. (those
// imports break under the bare-node Vitest runner).
export const identitySchema = z.object({
  name: z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN, "Name is required")
    .max(DISPLAY_NAME_MAX, `Max ${DISPLAY_NAME_MAX} characters`),
});

export type IdentityFormValues = z.infer<typeof identitySchema>;
