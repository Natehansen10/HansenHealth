import { type ButtonHTMLAttributes } from "react";
import { BlueprintCorners } from "./blueprint-corners";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "blueprint border border-accent-900 bg-accent-900 text-background hover:bg-accent-700 active:bg-accent-800",
  secondary:
    "border border-divider bg-transparent text-foreground hover:bg-neutral-100",
  danger: "border border-red-300 bg-transparent text-red-700 hover:bg-red-50",
};

export function Button({
  variant = "primary",
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-3 py-2 font-heading text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {variant === "primary" && <BlueprintCorners />}
      {children}
    </button>
  );
}
