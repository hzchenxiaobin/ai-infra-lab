// 报告相关纯工具（无 React 依赖，组件文件外共享以保 fast refresh 生效）

/** 去掉面试官消息里的寒暄/换题前缀，只保留题目本身 */
export function stripChatPrefix(content: string): string {
  return content
    .replace(/^你好，我是今天的面试官[\s\S]*?我们开始第一题：\s*/, "")
    .replace(/^好的，进入第\s*\d+\s*题：\s*/, "");
}
