import { registerProvider } from "../../registry";
import { AshbyAtsClient } from "./client";
import { AshbyApplyStrategy } from "./playwright-apply";
import { AshbyDiscoveryValidator } from "./validator";

export function registerAshbyProvider(): void {
  registerProvider("ASHBY", {
    client: (boardName) => new AshbyAtsClient(boardName),
    apply: () => new AshbyApplyStrategy(),
    validator: () => new AshbyDiscoveryValidator(),
  });
}

export { AshbyAtsClient } from "./client";
export { mapAshbyJobToNormalized } from "./mapper";
export type {
  AshbyApiJob,
  AshbyApiResponse,
  AshbyCompensation,
  AshbyCompensationTier,
  AshbyCompensationComponent,
} from "./types";
