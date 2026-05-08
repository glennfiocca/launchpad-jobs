import { buildCollectionRoute } from "@/lib/api/profile-child-route";
import { workExperienceSchema } from "@/lib/validation/profile-children";

export const { GET, POST } = buildCollectionRoute({
  model: "workExperience",
  createSchema: workExperienceSchema,
});
