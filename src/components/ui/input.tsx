"use client";

import { forwardRef, useId } from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      id,
      label,
      hint,
      type = "text",
      "aria-describedby": describedBy,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? `ui-input-${generatedId}`;
    const hintId = `${inputId}-hint`;
    const descriptionIds = [describedBy, hint ? hintId : null]
      .filter(Boolean)
      .join(" ");

    return (
      <div className="flex w-full flex-col gap-2 text-sm text-[var(--muted)]">
        {label ? (
          <label
            htmlFor={inputId}
            className="font-medium text-[var(--muted)] select-none"
          >
            {label}
          </label>
        ) : null}
        <input
          {...props}
          id={inputId}
          ref={ref}
          type={type}
          aria-describedby={descriptionIds || undefined}
          className={`ui-input ${className || ""}`}
        />
        {hint ? (
          <span id={hintId} className="text-xs text-[var(--muted)]">
            {hint}
          </span>
        ) : null}
      </div>
    );
  },
);

Input.displayName = "Input";
