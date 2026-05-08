import { buildCollectionRoute } from "@/lib/api/profile-child-route";
import { projectSchema } from "@/lib/validation/profile-children";

export const { GET, POST } = buildCollectionRoute({
  model: "project",
  createSchema: projectSchema,
});
