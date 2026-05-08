import { buildCollectionRoute } from "@/lib/api/profile-child-route";
import { certificationSchema } from "@/lib/validation/profile-children";

export const { GET, POST } = buildCollectionRoute({
  model: "certification",
  createSchema: certificationSchema,
});
