const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

export function interviewerMsg(text: string): string {
  return `${CYAN}${BOLD}[面试官]${RESET}\n${CYAN}${text}${RESET}`;
}

export function candidateMsg(text: string): string {
  return `${GREEN}${BOLD}[我]${RESET} ${GREEN}${text}${RESET}`;
}

export function systemMsg(text: string): string {
  return `${GRAY}${text}${RESET}`;
}

export function progressLine(current: number, total: number, followUp: number): string {
  return `${GRAY}── 第 ${current + 1}/${total} 题 · 追问 ${followUp}/${4} ──${RESET}`;
}

export function banner(text: string): string {
  return `${BOLD}${YELLOW}\n${"=".repeat(50)}${RESET}\n${BOLD}${YELLOW}  ${text}${RESET}\n${BOLD}${YELLOW}${"=".repeat(50)}${RESET}\n`;
}

export function errorLine(text: string): string {
  return `${RED}✗ ${text}${RESET}`;
}

export function successLine(text: string): string {
  return `${GREEN}✓ ${text}${RESET}`;
}

export function dimLine(text: string): string {
  return `${GRAY}${text}${RESET}`;
}

export function tableRow(cols: string[], widths: number[]): string {
  return cols.map((c, i) => c.padEnd(widths[i])).join("  ");
}

export { CYAN, GREEN, YELLOW, GRAY, BOLD, RED, RESET };
