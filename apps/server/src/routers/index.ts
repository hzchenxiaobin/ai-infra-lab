import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { contentRouter } from "./content.js";
import { healthRouter } from "./health.js";
import { interviewRouter } from "./interview.js";
import { judgeRouter } from "./judge.js";
import { problemRouter } from "./problem.js";
import { progressRouter } from "./progress.js";
import { questionRouter } from "./question.js";
import { quotaRouter } from "./quota.js";

export const appRouter = router({
  health: healthRouter,
  question: questionRouter,
  interview: interviewRouter,
  judge: judgeRouter,
  auth: authRouter,
  content: contentRouter,
  problem: problemRouter,
  progress: progressRouter,
  quota: quotaRouter,
});

export type AppRouter = typeof appRouter;
