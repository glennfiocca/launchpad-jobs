/**
 * Raw Greenhouse Board API response types.
 * These mirror the public API shapes — NOT the normalized ATS types.
 */

export interface GreenhouseBoard {
  name: string;
  website: string | null;
  logo: string | null;
}

export interface GreenhouseJob {
  id: number;
  title: string;
  updated_at: string;
  requisition_id: string | null;
  location: {
    name: string;
  };
  absolute_url: string;
  metadata: unknown[];
  content: string;
  departments: ReadonlyArray<{
    id: number;
    name: string;
    parent_id: number | null;
  }>;
  offices: ReadonlyArray<{
    id: number;
    name: string;
    location: string | null;
  }>;
  questions?: GreenhouseQuestion[];
}

export interface GreenhouseJobsResponse {
  jobs: GreenhouseJob[];
  meta: {
    total: number;
  };
}

export interface GreenhouseQuestionField {
  name: string;
  type:
    | "input_text"
    | "input_file"
    | "textarea"
    | "multi_value_single_select"
    | "multi_value_multi_select";
  values: ReadonlyArray<{ value: number; label: string }>;
}

export interface GreenhouseQuestion {
  label: string;
  required: boolean;
  description: string | null;
  fields: GreenhouseQuestionField[];
}
