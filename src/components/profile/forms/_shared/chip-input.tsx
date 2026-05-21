"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { directionAInputClass } from "./styles";

// Backspace double-tap window: first press arms a pending-delete state,
// second press within this window removes the last chip. Any other key
// or input change cancels the pending state.
const BACKSPACE_ARM_MS = 500;

// Generic chip / tag input — used for targetRoles, targetIndustries,
// relocationCities, eligibleCountries, project technologies, etc.
//
// Keyboard model:
//   Enter  → commit current draft as a chip
//   ,      → commit current draft as a chip
//   Bksp   → remove last chip (only when input is empty)
//
// The component is intentionally controlled — `value` lives on the parent so
// it integrates cleanly with both legacy form-state forms (preferences-form)
// and the optimistic `useChildResource` patches in the new list editors.

export interface ChipInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /**
   * Optional per-chip validator — return a string to reject the chip with
   * that message, or `null` to accept. Failed chips are NOT committed but
   * the draft is preserved so the user can fix it.
   */
  validate?: (chip: string) => string | null;
  disabled?: boolean;
  /**
   * Optional max-chip cap — when reached, further commits are no-ops.
   */
  maxChips?: number;
  /**
   * Optional value normalizer applied before validation/dedupe.
   * E.g. uppercase trimming for ISO codes.
   */
  normalize?: (raw: string) => string;
}

export function ChipInput({
  value,
  onChange,
  placeholder,
  validate,
  disabled,
  maxChips,
  normalize,
}: ChipInputProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // `pendingDelete` flips true on the first Backspace against an empty
  // input; a second Backspace within BACKSPACE_ARM_MS removes the last
  // chip. The timer ref clears the arm state on timeout.
  const [pendingDelete, setPendingDelete] = useState(false);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearArmTimer = () => {
    if (armTimerRef.current) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  };

  const disarm = () => {
    clearArmTimer();
    setPendingDelete(false);
  };

  // Always clean up the arm timer if the component unmounts mid-window.
  useEffect(() => clearArmTimer, []);

  const commit = () => {
    const cleaned = (normalize ?? ((s: string) => s.trim()))(draft);
    if (!cleaned) return;
    if (maxChips !== undefined && value.length >= maxChips) {
      setError(`Maximum ${maxChips} entries`);
      return;
    }
    if (value.includes(cleaned)) {
      // Silent dedupe — clear draft, keep existing chips.
      setDraft("");
      setError(null);
      return;
    }
    if (validate) {
      const validationError = validate(cleaned);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    onChange([...value, cleaned]);
    setDraft("");
    setError(null);
  };

  const removeAt = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      disarm();
      commit();
      return;
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      if (pendingDelete) {
        disarm();
        removeAt(value.length - 1);
        return;
      }
      // Arm: visually highlight the last chip and start the 500ms timer.
      clearArmTimer();
      setPendingDelete(true);
      armTimerRef.current = setTimeout(() => {
        setPendingDelete(false);
        armTimerRef.current = null;
      }, BACKSPACE_ARM_MS);
      return;
    }
    // Any other key cancels the pending-delete state.
    if (pendingDelete) disarm();
  };

  return (
    <div className="space-y-2">
      <div
        className={`${directionAInputClass} flex flex-wrap items-center gap-1.5 ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {value.map((chip, idx) => {
          const isLast = idx === value.length - 1;
          const armed = pendingDelete && isLast;
          return (
            <span
              key={`${chip}-${idx}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                armed
                  ? "bg-red-500/10 text-red-300 ring-1 ring-red-400/40 border border-red-400/40"
                  : "bg-[rgba(196,181,253,0.08)] text-[var(--color-accent-lavender)] border border-[rgba(196,181,253,0.22)]"
              }`}
            >
              {chip}
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeAt(idx)}
                aria-label={`Remove ${chip}`}
                className="text-[var(--color-accent-lavender)] opacity-60 hover:opacity-100 transition-opacity disabled:hover:opacity-60"
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          className="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-sm text-[var(--text)] placeholder:text-[var(--text-dim)] disabled:cursor-not-allowed"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
            if (pendingDelete) disarm();
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            disarm();
            commit();
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          disabled={disabled}
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
