import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-ink text-white hover:bg-[#10192b]",
  secondary: "bg-panel text-ink ring-1 ring-line hover:bg-shell",
  ghost: "text-ink hover:bg-shell",
  danger: "bg-red-600 text-white hover:bg-red-700"
} as const;

const sizes = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base"
} as const;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
};

export function Button({
  asChild = false,
  children,
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-2xl font-medium transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.14)] active:translate-y-px active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:active:translate-y-0 disabled:active:scale-100",
    variants[variant],
    sizes[size],
    className
  );

  if (asChild) {
    const child = React.Children.only(children);

    if (!React.isValidElement(child)) {
      return null;
    }

    const element = child as React.ReactElement<{ className?: string }>;

    return React.cloneElement(element, {
      className: cn(classes, element.props.className)
    });
  }

  return (
    <button
      className={classes}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
