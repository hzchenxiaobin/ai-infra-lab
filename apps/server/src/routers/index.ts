import { router } from "../trpc.js";
import { healthRouter } from "./health.js";
import { interviewRouter } from "./interview.js";
import { judgeRouter } from "./judge.js";
import { questionRouter } from "./question.js";

export const appRouter = router({
  health: healthRouter,
  question: questionRouter,
  interview: interviewRouter,
  judge: judgeRouter,
});

export type AppRouter = typeof appRouter;
