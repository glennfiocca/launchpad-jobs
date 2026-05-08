import { buildItemRoute } from "@/lib/api/profile-child-route";
import { workExperienceUpdateSchema } from "@/lib/validation/profile-children";

export const { PUT, DELETE } = buildItemRoute({
  model: "workExperience",
  updateSchema: workExperienceUpdateSchema,
});
