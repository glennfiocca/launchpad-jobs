import { buildItemRoute } from "@/lib/api/profile-child-route";
import { educationEntryUpdateSchema } from "@/lib/validation/profile-children";

export const { PUT, DELETE } = buildItemRoute({
  model: "educationEntry",
  updateSchema: educationEntryUpdateSchema,
});
