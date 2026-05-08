import { buildItemRoute } from "@/lib/api/profile-child-route";
import { skillUpdateSchema } from "@/lib/validation/profile-children";

export const { PUT, DELETE } = buildItemRoute({
  model: "skill",
  updateSchema: skillUpdateSchema,
  uniqueResource: true,
});
