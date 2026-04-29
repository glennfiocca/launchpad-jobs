import { registerProvider } from "../../registry";
import { AshbyAtsClient } from "./client";
import { AshbyDiscoveryValidator } from "./validator";

export function registerAshbyProvider(): void {
  registerProvider("ASHBY", {
    client: (boardName) => new AshbyAtsClient(boardName),
    apply: () => {
      throw new Error("Ashby apply strategy not yet implemented");
    },
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
