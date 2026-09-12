import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Difficulty } from "@ailab/contracts";
import { DIFFICULTY_LABELS } from "../lib/format";
import { SEGMENTED_CLASS, segmentedItemClass } from "../lib/segmented";

// ---------------------------------------------------------------------------
// 设计系统公共组件：页面一律复用这里的组件，不要在页面内重复实现样式。
// 令牌（颜色/阴影/动效）见 index.css 的 @theme。
// ---------------------------------------------------------------------------

/* ---------------------------------- 图标 ---------------------------------- */

function SvgIcon({
  className = "",
  viewBox = "0 0 16 16",
  strokeWidth = 1.5,
  path,
}: {
  className?: string;
  viewBox?: string;
  strokeWidth?: number;
  path: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}

export function ArrowIcon({ className = "" }: { className?: string }) {
  return <SvgIcon className={className} path="M2.5 8h10M9 4l4 4-4 4" />;
}

export function BackArrowIcon({ className = "" }: { className?: string }) {
  return <SvgIcon className={className} path="M13.5 8h-10M7 4l-4 4 4 4" />;
}

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <SvgIcon className={className} viewBox="0 0 12 12" strokeWidth={2} path="M2.5 6.5l2.5 2.5 4.5-5" />
  );
}

export function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <SvgIcon className={className} viewBox="0 0 12 12" path="M3 4.5l3 3 3-3" />
  );
}

function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <SvgIcon className={className} viewBox="0 0 12 12" path="M2.5 2.5l7 7M9.5 2.5l-7 7" />
  );
}

/* --------------------------------- 页面骨架 --------------------------------- */

/** 微型区块标签：大写、宽字距、强调色 */
export function MicroLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-600">
      {children}
    </div>
  );
}

/** 统一页面标题区：MicroLabel + 页标题 + 描述，actions 放右侧次要操作 */
export function PageHeader({
  label,
  title,
  description,
  actions,
  children,
  className = "",
}: {
  label: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** 额外内容（如进度条），渲染在标题区内部 */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`animate-fade-up ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <MicroLabel>{label}</MicroLabel>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
          {description != null && <p className="mt-2 text-sm text-muted">{description}</p>}
        </div>
        {actions != null && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** 区块标题（页面内 section）：统一字号层级 */
export function SectionTitle({
  title,
  description,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description != null && <p className="mt-1 text-xs text-muted">{description}</p>}
    </div>
  );
}

/* ---------------------------------- 容器 ---------------------------------- */

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-5 shadow-soft ${className}`}>
      {children}
    </div>
  );
}

/** 行式列表容器：divide-y 分隔的卡片（题目列表、场次列表等共用） */
export function ListCard({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`divide-y divide-divider overflow-hidden rounded-2xl border border-line bg-surface shadow-soft ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------------------------- 按钮 ---------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-accent-600 text-white hover:bg-accent-700 disabled:bg-divider disabled:text-faint",
  secondary:
    "border border-line bg-surface text-ink shadow-xs hover:bg-page disabled:text-muted disabled:hover:bg-surface",
  ghost: "text-muted hover:bg-divider hover:text-ink disabled:text-faint disabled:hover:bg-transparent",
  danger:
    "border border-accent-600/40 bg-surface text-accent-400 hover:bg-accent-600/10 disabled:text-accent-600/40 disabled:hover:bg-surface",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-1.5 text-sm",
  lg: "h-12 px-7 text-sm font-semibold",
};

/** 按钮类名拼接：供 Link 等非 button 元素复用按钮样式 */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `rounded-full font-medium transition-colors duration-150 disabled:cursor-not-allowed ${BUTTON_SIZES[size]} ${BUTTON_STYLES[variant]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...props} />
  );
}

/* ------------------------------- 分段选择器 ------------------------------- */

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
  itemClassName = "px-3 py-1 text-sm",
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div className={`${SEGMENTED_CLASS} ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded-full transition-colors duration-150 ${itemClassName} ${segmentedItemClass(value === o.value, o.disabled)}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- 进度条 --------------------------------- */

export function ProgressBar({
  value,
  size = "md",
  className = "",
}: {
  /** 0–100 的百分比 */
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const height = size === "sm" ? "h-1" : size === "lg" ? "h-2" : "h-1.5";
  return (
    <div className={`overflow-hidden rounded-full bg-divider ${height} ${className}`}>
      <div
        className="h-full rounded-full bg-accent-600 transition-all duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* --------------------------------- 状态反馈 --------------------------------- */

const ERROR_BOX_CLASS =
  "rounded-lg border border-accent-600/30 bg-accent-600/10 text-sm text-accent-400";

/** 加载 spinner（Loading 与行内加载态共用） */
export function Spinner({ className = "size-3.5" }: { className?: string }) {
  return (
    <span
      className={`animate-spin rounded-full border-2 border-line border-t-muted ${className}`}
    />
  );
}

export function Loading({ text = "加载中…" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <Spinner />
      {text}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return <div className={`${ERROR_BOX_CLASS} px-4 py-3`}>出错了：{message}</div>;
}

/** 成功反馈（与 ErrorBox 同族，accent 亮文字档语义） */
export function SuccessBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-accent-600/30 bg-accent-600/10 px-4 py-3 text-sm text-accent-300">
      {children}
    </div>
  );
}

/** 表单/操作内的内联错误提示（与 ErrorBox 同族，更紧凑） */
export function InlineError({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`${ERROR_BOX_CLASS} px-3 py-2 ${className}`}>{children}</p>;
}

export function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-muted">
      {text}
    </div>
  );
}

/* ---------------------------------- 弹窗 ---------------------------------- */

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`max-h-[85vh] w-full animate-fade-up overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-lift ${wide ? "max-w-2xl" : "max-w-md"}`}
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

/* ---------------------------------- 徽章 ---------------------------------- */

/** 状态 pill：进行中（active，带脉冲点）/ 已完成（done）/ 评测通过（ac） */
export function StatusPill({
  variant,
  children,
}: {
  variant: "active" | "done" | "ac";
  children?: ReactNode;
}) {
  const styles = {
    active: "bg-accent-100 font-medium text-accent-600",
    done: "bg-surface text-muted ring-1 ring-inset ring-line",
    ac: "bg-accent-100 font-medium text-accent-600",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${styles[variant]}`}
    >
      {variant === "active" && (
        <span className="size-1.5 animate-pulse-dot rounded-full bg-accent-600" />
      )}
      {children}
    </span>
  );
}

/** 标签/知识点小片；accent 变体用于强调标签 */
export function Chip({
  accent,
  className = "",
  children,
}: {
  accent?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-xs ${accent ? "bg-accent-50 text-accent-600" : "bg-page text-muted"} ${className}`}
    >
      {children}
    </span>
  );
}

/* 二值化徽章：A/B 红色描边红字，C/D 及其余一律灰系 */
const GRADE_BADGE_STYLES: Record<string, string> = {
  A: "bg-surface text-accent-600 ring-accent-600/40",
  B: "bg-surface text-accent-600 ring-accent-600/40",
};

export function GradeBadge({ grade }: { grade: string | null | undefined }) {
  if (!grade) return <span className="text-xs text-faint">—</span>;
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${GRADE_BADGE_STYLES[grade] ?? "bg-surface text-muted ring-faint"}`}
    >
      {grade}
    </span>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return (
    <span className="rounded-md bg-surface px-1.5 py-0.5 text-xs text-muted ring-1 ring-inset ring-line">
      {DIFFICULTY_LABELS[difficulty as Difficulty] ?? difficulty}
    </span>
  );
}
