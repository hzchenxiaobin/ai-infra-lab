/** 按钮样式令牌：Button 组件与 Link 等非 button 元素共用（lib 层非组件模块） */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

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

/** 按钮类名拼接：供 Link 等非 button 元素复用按钮样式；
 *  btn-ui / btn-ui-{variant} 为稳定钩子，供板块作用域样式（interview.css）覆写 */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `btn-ui btn-ui-${variant} rounded-full font-medium transition-colors duration-150 disabled:cursor-not-allowed ${BUTTON_SIZES[size]} ${BUTTON_STYLES[variant]}`;
}
