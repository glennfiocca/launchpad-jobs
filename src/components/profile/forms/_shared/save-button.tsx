"use client";

import { submitButtonClass } from "./styles";

interface SaveButtonProps {
  saving: boolean;
  /** When true, the button is disabled and shows the gating reason on hover. */
  disabled?: boolean;
  /** Tooltip / a11y label shown when `disabled` is true. */
  disabledReason?: string;
}

export function SaveButton({ saving, disabled, disabledReason }: SaveButtonProps) {
  const isDisabled = saving || Boolean(disabled);
  return (
    <div className="flex justify-end">
      <button
        type="submit"
        disabled={isDisabled}
        title={disabled ? disabledReason : undefined}
        aria-disabled={isDisabled}
        className={submitButtonClass}
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
