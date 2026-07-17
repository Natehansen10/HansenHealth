import { type HTMLAttributes } from "react";
import { BlueprintCorners } from "./blueprint-corners";

export function Card({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`blueprint border border-divider bg-transparent p-6 ${className}`}
      {...props}
    >
      <BlueprintCorners />
      {children}
    </div>
  );
}
