/** 分段选择器容器样式（nav / tab / 筛选 pill 共用）；Link 场景可自行套用 */
export const SEGMENTED_CLASS = "flex gap-0.5 rounded-full bg-divider p-1";

export function segmentedItemClass(active: boolean, disabled = false): string {
  if (disabled) return "cursor-not-allowed text-faint";
  return active
    ? "bg-ink font-medium text-page"
    : "text-muted transition-colors duration-150 hover:text-ink";
}
