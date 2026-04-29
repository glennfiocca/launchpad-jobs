import { registerGreenhouseProvider } from "./providers/greenhouse";
import { registerAshbyProvider } from "./providers/ashby";

let initialized = false;

export function initializeAtsProviders(): void {
  if (initialized) return;
  registerGreenhouseProvider();
  registerAshbyProvider();
  initialized = true;
}
