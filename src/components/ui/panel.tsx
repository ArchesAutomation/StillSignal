"use client";
import { forwardRef, type HTMLAttributes } from "react";
export const Panel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = "", ...props }, ref) => (
    <div ref={ref} className={`ui-panel ${className}`} {...props} />
  ),
);
Panel.displayName = "Panel";
