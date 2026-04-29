import { registerProvider } from "../../registry";
import { GreenhouseAtsClient } from "./client";
import { GreenhouseApplyStrategy } from "./apply-strategy";
import { GreenhouseDiscoveryValidator } from "./validator";

export function registerGreenhouseProvider(): void {
  registerProvider("GREENHOUSE", {
    client: (boardToken) => new GreenhouseAtsClient(boardToken),
    apply: () => new GreenhouseApplyStrategy(),
    validator: () => new GreenhouseDiscoveryValidator(),
  });
}

export { GreenhouseAtsClient } from "./client";
export {
  mapGreenhouseJobToNormalized,
  mapGreenhouseQuestionToNormalized,
  mapFieldType,
} from "./mapper";
export type {
  GreenhouseBoard,
  GreenhouseJob,
  GreenhouseJobsResponse,
  GreenhouseQuestion,
  GreenhouseQuestionField,
} from "./types";
