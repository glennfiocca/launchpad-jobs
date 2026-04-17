import type { GreenhouseQuestionField } from "@/types";

// Re-export the Playwright-based engine — same interface, no breaking changes
export type { ApplyOptions, ApplyResult } from "@/lib/greenhouse/playwright-apply";
export { applyToGreenhouseJob } from "@/lib/greenhouse/playwright-apply";

// Map Greenhouse question types to our form field types
export function mapQuestionType(
  ghType: GreenhouseQuestionField["type"]
): "text" | "textarea" | "file" | "select" | "multiselect" {
  switch (ghType) {
    case "input_text":
      return "text";
    case "textarea":
      return "textarea";
    case "input_file":
      return "file";
    case "multi_value_single_select":
      return "select";
    case "multi_value_multi_select":
      return "multiselect";
    default:
      return "text";
  }
}
