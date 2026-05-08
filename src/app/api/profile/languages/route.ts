import { buildCollectionRoute } from "@/lib/api/profile-child-route";
import { spokenLanguageSchema } from "@/lib/validation/profile-children";

export const { GET, POST } = buildCollectionRoute({
  model: "spokenLanguage",
  createSchema: spokenLanguageSchema,
  uniqueResource: true, // (profileId, name) unique
});
