import { z } from "zod";

// Pulled out of email-change-form.tsx so unit tests can import the schema
// without dragging in `react-hook-form`, `next-auth/react`, etc. (those
// imports break under the bare-node Vitest runner).
//
// .toLowerCase() normalizes for both client-side feedback and server-side
// duplicate checks. The server re-validates regardless.
export const emailChangeSchema = z.object({
  newEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(254, "Email is too long"),
});

export type EmailChangeFormValues = z.infer<typeof emailChangeSchema>;
