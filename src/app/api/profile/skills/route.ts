import { buildCollectionRoute } from "@/lib/api/profile-child-route";
import { skillSchema } from "@/lib/validation/profile-children";

export const { GET, POST } = buildCollectionRoute({
  model: "skill",
  createSchema: skillSchema,
  uniqueResource: true, // (profileId, name) unique
});
