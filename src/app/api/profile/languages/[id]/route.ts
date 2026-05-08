import { buildItemRoute } from "@/lib/api/profile-child-route";
import { spokenLanguageUpdateSchema } from "@/lib/validation/profile-children";

export const { PUT, DELETE } = buildItemRoute({
  model: "spokenLanguage",
  updateSchema: spokenLanguageUpdateSchema,
  uniqueResource: true,
});
