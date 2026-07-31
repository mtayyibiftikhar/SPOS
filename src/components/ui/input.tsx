import * as React from "react";
import { sanitizeNumericInput } from "@/lib/numeric-input";
import { sanitizePhoneInput } from "@/lib/phone";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, inputMode, onChange, onKeyDown, onPaste, step, type, ...props }, ref) => {
    const isPhoneInput = inputMode === "tel" || type === "tel";
    const isNumericInput = type === "number" || inputMode === "decimal" || inputMode === "numeric";
    const allowsDecimal = isNumericInput && inputMode !== "numeric" && String(step ?? "").toLowerCase() !== "1";

    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-accentSoft",
          className
        )}
        inputMode={inputMode}
        type={type}
        step={step}
        onChange={(event) => {
          if (isPhoneInput) {
            event.currentTarget.value = sanitizePhoneInput(event.currentTarget.value);
          } else if (isNumericInput) {
            event.currentTarget.value = sanitizeNumericInput(event.currentTarget.value, allowsDecimal);
          }

          onChange?.(event);
        }}
        onKeyDown={(event) => {
          if (
            isNumericInput &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            event.key.length === 1 &&
            !/^\d$/.test(event.key) &&
            !(allowsDecimal && event.key === ".")
          ) {
            event.preventDefault();
          }

          onKeyDown?.(event);
        }}
        onPaste={(event) => {
          if (isNumericInput) {
            const pasted = event.clipboardData.getData("text").trim();
            const isValid = allowsDecimal ? /^\d*(?:\.\d*)?$/.test(pasted) : /^\d*$/.test(pasted);

            if (!isValid) {
              event.preventDefault();
            }
          }

          onPaste?.(event);
        }}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
