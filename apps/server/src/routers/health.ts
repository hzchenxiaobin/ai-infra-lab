import { healthCheckSchema } from "@ailab/contracts";
import { publicProcedure, router } from "../trpc.js";

export const healthRouter = router({
  health: publicProcedure
    .input(healthCheckSchema)
    .query(({ input, ctx }) => ({
      ok: true as const,
      message: `hello ${input?.name ?? "interview"}`,
      userId: ctx.userId,
      now: new Date(),
    })),
});
