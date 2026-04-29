import type { AtsProvider } from "@prisma/client";

import type {
  AtsClient,
  AtsApplyStrategy,
  AtsDiscoveryValidator,
} from "./types";

type ClientFactory = (boardToken: string) => AtsClient;
type ApplyFactory = () => AtsApplyStrategy;
type ValidatorFactory = () => AtsDiscoveryValidator;

const clients = new Map<AtsProvider, ClientFactory>();
const appliers = new Map<AtsProvider, ApplyFactory>();
const validators = new Map<AtsProvider, ValidatorFactory>();

export function registerProvider(
  provider: AtsProvider,
  config: {
    client: ClientFactory;
    apply: ApplyFactory;
    validator: ValidatorFactory;
  }
): void {
  clients.set(provider, config.client);
  appliers.set(provider, config.apply);
  validators.set(provider, config.validator);
}

export function getClient(
  provider: AtsProvider,
  boardToken: string
): AtsClient {
  const factory = clients.get(provider);
  if (!factory) {
    throw new Error(`No ATS client registered for provider: ${provider}`);
  }
  return factory(boardToken);
}

export function getApplyStrategy(provider: AtsProvider): AtsApplyStrategy {
  const factory = appliers.get(provider);
  if (!factory) {
    throw new Error(
      `No apply strategy registered for provider: ${provider}`
    );
  }
  return factory();
}

export function getDiscoveryValidator(
  provider: AtsProvider
): AtsDiscoveryValidator {
  const factory = validators.get(provider);
  if (!factory) {
    throw new Error(
      `No discovery validator registered for provider: ${provider}`
    );
  }
  return factory();
}

export function getRegisteredProviders(): readonly AtsProvider[] {
  return Array.from(clients.keys());
}
