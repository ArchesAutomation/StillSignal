"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(({ className = "", type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={`ui-button ${className}`}
    {...props}
  />
));
Button.displayName = "Button";
