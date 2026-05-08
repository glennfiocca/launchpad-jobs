import { buildItemRoute } from "@/lib/api/profile-child-route";
import { projectUpdateSchema } from "@/lib/validation/profile-children";

export const { PUT, DELETE } = buildItemRoute({
  model: "project",
  updateSchema: projectUpdateSchema,
});
