import { buildItemRoute } from "@/lib/api/profile-child-route";
import { educationEntryUpdateSchema } from "@/lib/validation/profile-children";
import { EDUCATION_ENTRY_INCLUDE } from "../_include";

export const { PUT, DELETE } = buildItemRoute({
  model: "educationEntry",
  updateSchema: educationEntryUpdateSchema,
  // Match the GET/POST response shape so a PUT round-trip lets the form keep
  // its joined university summary in sync after a field edit.
  include: EDUCATION_ENTRY_INCLUDE,
});
