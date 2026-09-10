import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { appRouter } from "@ailab/server/router";
import type { AppRouter } from "@ailab/server/router";
import { getCurrentUserId } from "@ailab/server/auth";
import { banner, candidateMsg, dimLine, errorLine, interviewerMsg, progressLine, successLine } from "./ui.js";

type Caller = ReturnType<AppRouter["createCaller"]>;

export async function getCaller(): Promise<Caller> {
  const userId = await getCurrentUserId();
  return appRouter.createCaller({ userId });
}

/** 交互式面试会话：展示历史 → 问答循环 → 自动报告 */
export async function runSession(sessionId: number, caller: Caller): Promise<void> {
  const detail = await caller.interview.get({ sessionId });

  console.log(banner(detail.session.title));

  for (const msg of detail.messages) {
    if (msg.role === "interviewer") {
      console.log(interviewerMsg(msg.content));
      console.log();
    } else if (msg.role === "candidate") {
      console.log(candidateMsg(msg.content));
      console.log();
    }
  }

  if (detail.session.status === "finished") {
    console.log(banner("面试评估报告"));
    console.log(detail.report?.report ?? "（无报告）");
    process.exit(0);
  }

  const total = detail.session.questionIds.length;
  const rl = readline.createInterface({ input, output, terminal: false });

  console.log(dimLine("输入回答后按空行提交。输入 :end 提前结束，:quit 退出不保存。\n"));

  while (true) {
    const state = detail.session;
    console.log(progressLine(state.currentIndex, total, state.followUpIndex));

    const lines: string[] = [];
    while (true) {
      const line = await rl.question(lines.length === 0 ? "> " : "");
      if (line === "" && lines.length > 0) break;
      if (line === "" && lines.length === 0) continue;
      if (line.trim() === ":end") {
        await endSession(sessionId, caller, rl);
        process.exit(0);
      }
      if (line.trim() === ":quit") {
        console.log(dimLine("已退出，面试进度已保存，可稍后 resume。"));
        rl.close();
        process.exit(0);
      }
      lines.push(line);
    }

    const answer = lines.join("\n");
    console.log(candidateMsg(answer));
    console.log();

    let result;
    try {
      result = await caller.interview.reply({ sessionId, content: answer });
    } catch (err) {
      console.log(errorLine(`提交失败：${(err as Error).message}`));
      continue;
    }

    console.log(interviewerMsg(result.interviewerMessage));
    console.log();

    if (result.state.status === "finished") {
      await showReport(sessionId, caller, rl);
      process.exit(0);
    }
  }
}

async function endSession(sessionId: number, caller: Caller, rl: readline.Interface): Promise<void> {
  console.log(dimLine("正在结束面试并生成报告…"));
  rl.close();
  try {
    await caller.interview.finish({ sessionId });
  } catch {
    // finish 可能已被 reply 自动触发
  }
  await showReport(sessionId, caller, null);
  process.exit(0);
}

async function showReport(sessionId: number, caller: Caller, rl: readline.Interface | null): Promise<void> {
  const detail = await caller.interview.get({ sessionId });
  console.log(banner("面试评估报告"));
  console.log(detail.report?.report ?? "（报告生成失败）");
  if (detail.session.overallGrade) {
    console.log(successLine(`综合等级：${detail.session.overallGrade}`));
  }
  if (rl) rl.close();
}
