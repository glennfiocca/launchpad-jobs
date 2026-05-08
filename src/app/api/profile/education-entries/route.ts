import { buildCollectionRoute } from "@/lib/api/profile-child-route";
import { educationEntrySchema } from "@/lib/validation/profile-children";

export const { GET, POST } = buildCollectionRoute({
  model: "educationEntry",
  createSchema: educationEntrySchema,
});
