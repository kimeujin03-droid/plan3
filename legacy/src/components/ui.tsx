import React from "react";
import clsx from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition",
        {
          "bg-[color:var(--primary)] text-white hover:opacity-90": variant === "primary",
          "bg-[color:var(--secondary)] text-[color:var(--fg)] hover:opacity-80": variant === "secondary",
          "bg-transparent text-[color:var(--fg)] hover:bg-[color:var(--secondary)]": variant === "ghost",
        },
        {
          "h-8 px-3 text-sm": size === "sm",
          "h-10 px-4 text-sm": size === "md",
          "h-12 px-6 text-base": size === "lg",
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
}

export function IconButton({ size = "md", className, children, ...props }: IconButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] transition hover:bg-[color:var(--secondary)] disabled:opacity-40",
        {
          "h-8 w-8": size === "sm",
          "h-10 w-10": size === "md",
          "h-12 w-12": size === "lg",
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={clsx(
        "w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-sm text-[color:var(--fg)] outline-none focus:border-[color:var(--primary)] focus:ring-1 focus:ring-[color:var(--primary)]",
        className
      )}
      {...props}
    />
  );
}

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export function Label({ className, children, ...props }: LabelProps) {
  return (
    <label
      className={clsx("block text-sm font-medium text-[color:var(--fg)]", className)}
      {...props}
    >
      {children}
    </label>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={clsx("my-2 h-px bg-[color:var(--border)]", className)} />;
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-4 shadow-[var(--shadow)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
