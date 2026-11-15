import React, { useEffect, useRef } from "react";
import clsx from "clsx";

export interface DialogProps {
  open: boolean;
  title?: string;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, title, onClose, onOpenChange, children }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleClose = () => {
    onClose?.();
    onOpenChange?.(false);
  };

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={dialogRef}
        className={clsx(
          "w-full max-w-md rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-6 shadow-xl"
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "dialog-title" : undefined}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 id="dialog-title" className="text-lg font-semibold">
              {title}
            </h2>
            <button
              className="rounded-md p-1 text-[color:var(--fg)] hover:bg-[color:var(--secondary)]"
              onClick={handleClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
