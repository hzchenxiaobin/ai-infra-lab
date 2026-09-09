import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Difficulty } from "@ailab/contracts";
import { DIFFICULTY_LABELS } from "../lib/format";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-line bg-white p-4 shadow-soft ${className}`}>
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-accent-600 text-white hover:bg-accent-700 disabled:bg-[#eceff3] disabled:text-[#b3bccb]",
  secondary:
    "border border-line bg-white text-ink shadow-xs hover:bg-page disabled:text-muted disabled:hover:bg-white",
  danger:
    "border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:text-red-300 disabled:hover:bg-white",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
    >
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
    </svg>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className={`max-h-[85vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-lift ${wide ? "max-w-2xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="grid size-8 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-divider hover:text-ink"
          >
            <CloseIcon className="size-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Loading({ text = "加载中…" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-muted" />
      {text}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-lg border border-red-100 bg-red-50/60 px-4 py-3 text-sm text-red-600">
      出错了：{message}
    </div>
  );
}

export function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-muted">
      {text}
    </div>
  );
}

/* 二值化徽章：A/B 红色描边红字，C/D 及其余一律灰系 */
const GRADE_BADGE_STYLES: Record<string, string> = {
  A: "bg-white text-accent-600 ring-accent-600/40",
  B: "bg-white text-accent-600 ring-accent-600/40",
};

export function GradeBadge({ grade }: { grade: string | null | undefined }) {
  if (!grade) return <span className="text-xs text-faint">—</span>;
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${GRADE_BADGE_STYLES[grade] ?? "bg-white text-muted ring-faint"}`}
    >
      {grade}
    </span>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return (
    <span className="rounded-md bg-white px-1.5 py-0.5 text-muted ring-1 ring-inset ring-line">
      {DIFFICULTY_LABELS[difficulty as Difficulty] ?? difficulty}
    </span>
  );
}
