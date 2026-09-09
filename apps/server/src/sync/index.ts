import { createHash } from "node:crypto";

/** 幂等入库用的内容指纹（bank:import 用）：标题 + 题面 + 追问 + 评分要点 */
export function contentHash(q: {
  title: string;
  content: string;
  followUps: string[];
  keyPoints: string;
}): string {
  return createHash("sha256")
    .update([q.title, q.content, q.followUps.join(""), q.keyPoints].join(""))
    .digest("hex");
}
