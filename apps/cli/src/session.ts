import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@ailab/server/router";
import { env } from "./env.js";
import { banner, candidateMsg, dimLine, errorLine, interviewerMsg, progressLine, successLine } from "./ui.js";

export type Caller = ReturnType<typeof createTRPCClient<AppRouter>>;

/**
 * 身份解析：--user <email>（全局 option，index.ts 的 preAction 钩子统一写入
 * AILAB_USER）或直接设 AILAB_USER 环境变量。CLI 走 HTTP tRPC（与 web/iOS 同
 * 协议），服务身份经请求头传递（server 端见 auth.ts cliUserIdFromHeaders）：
 *   x-ailab-cli-token：与 server .env 的 CLI_TOKEN 一致（服务间共享密钥）
 *   x-ailab-cli-user：上述 --user 邮箱（server 按邮箱解析 userId）
 * 管理命令（content:sync / user:* / quota:*）还要求该邮箱在服务端
 * ADMIN_EMAILS 中（adminProcedure 校验）。
 */
export async function getCaller(): Promise<Caller> {
  const email = process.env.AILAB_USER?.trim();
  if (!email) {
    console.log(errorLine("未指定操作身份：--user <email> 或环境变量 AILAB_USER"));
    console.log(dimLine("管理命令（content:sync / user:* / quota:*）还需该邮箱在服务端 ADMIN_EMAILS 中"));
    process.exit(1);
  }
  if (!env.cliToken) {
    console.log(errorLine("未配置 CLI_TOKEN（需与 server .env 的 CLI_TOKEN 一致；服务端未设置时此通道关闭）"));
    process.exit(1);
  }
  const caller = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${env.serverUrl}/trpc`,
        transformer: superjson,
        headers: () => ({
          "x-ailab-cli-token": env.cliToken,
          "x-ailab-cli-user": email,
        }),
      }),
    ],
  });
  // 身份预检（对应原 getUserIdByEmail 的「用户不存在」快速失败）：
  // UNAUTHORIZED = 用户不存在或 CLI_TOKEN 与服务端不一致
  try {
    await caller.auth.me.query();
  } catch (err) {
    if (err instanceof TRPCClientError && err.data?.code === "UNAUTHORIZED") {
      console.log(errorLine(`身份无效：${email}（用户不存在，或 CLI_TOKEN 与服务端不一致）`));
      console.log(dimLine("先在 web 注册该邮箱，或核对 --user 拼写与 .env 的 CLI_TOKEN"));
    } else {
      console.log(errorLine(`无法连接 server（${env.serverUrl}）：${(err as Error).message}`));
      console.log(dimLine("确认 server 已启动，或用 AILAB_SERVER_URL 指定地址"));
    }
    process.exit(1);
  }
  return caller;
}

/** 交互式面试会话：展示历史 → 问答循环 → 自动报告 */
export async function runSession(sessionId: number, caller: Caller): Promise<void> {
  const detail = await caller.interview.get.query({ sessionId });

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
      result = await caller.interview.reply.mutate({ sessionId, content: answer });
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
    await caller.interview.finish.mutate({ sessionId });
  } catch {
    // finish 可能已被 reply 自动触发
  }
  await showReport(sessionId, caller, null);
  process.exit(0);
}

async function showReport(sessionId: number, caller: Caller, rl: readline.Interface | null): Promise<void> {
  const detail = await caller.interview.get.query({ sessionId });
  console.log(banner("面试评估报告"));
  console.log(detail.report?.report ?? "（报告生成失败）");
  if (detail.session.overallGrade) {
    console.log(successLine(`综合等级：${detail.session.overallGrade}`));
  }
  if (rl) rl.close();
}
