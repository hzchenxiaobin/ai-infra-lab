/** 报告生成进度：finishSession 各阶段写入内存，供 get 查询随场次一起返回。
 *  报告写库后清除；评估失败时保留错误信息，前端据此展示失败原因和「重新生成」入口。
 *  纯内存态，进程重启后回退为 pending（此时报告要么已完成，要么需要手动重新生成）。 */
export type ReportProgressStage = "evaluating" | "rendering" | "failed" | "pending" | "done";

export interface ReportProgress {
  stage: ReportProgressStage;
  error?: string;
}

const progressBySession = new Map<number, ReportProgress>();

export function setReportProgress(sessionId: number, stage: ReportProgressStage, error?: string) {
  if (stage === "done") {
    progressBySession.delete(sessionId);
    return;
  }
  progressBySession.set(sessionId, { stage, error });
}

export function getReportProgress(sessionId: number): ReportProgress | undefined {
  return progressBySession.get(sessionId);
}
