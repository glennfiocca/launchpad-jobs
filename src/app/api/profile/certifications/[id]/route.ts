import { buildItemRoute } from "@/lib/api/profile-child-route";
import { certificationUpdateSchema } from "@/lib/validation/profile-children";

export const { PUT, DELETE } = buildItemRoute({
  model: "certification",
  updateSchema: certificationUpdateSchema,
});
