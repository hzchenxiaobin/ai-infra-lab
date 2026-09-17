import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  interviewNoteCreateSchema,
  interviewNoteUpdateSchema,
  numericIdParamSchema,
} from "@ailab/contracts";
import { db } from "../db/client.js";
import { interviewNotes } from "../db/schema.js";
import { authedProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// 面试复盘笔记：用户以 markdown 记录每次面试过程，仅本人可见。
// ---------------------------------------------------------------------------

export const noteRouter = router({
  list: authedProcedure.query(async ({ ctx }) =>
    db
      .select()
      .from(interviewNotes)
      .where(eq(interviewNotes.userId, ctx.userId))
      .orderBy(desc(interviewNotes.updatedAt)),
  ),

  create: authedProcedure.input(interviewNoteCreateSchema).mutation(async ({ input, ctx }) => {
    const inserted = await db
      .insert(interviewNotes)
      .values({ userId: ctx.userId, title: input.title, content: input.content })
      .$returningId();
    return { id: inserted[0].id };
  }),

  update: authedProcedure.input(interviewNoteUpdateSchema).mutation(async ({ input, ctx }) => {
    const result = await db
      .update(interviewNotes)
      .set(input.data)
      .where(and(eq(interviewNotes.id, input.id), eq(interviewNotes.userId, ctx.userId)));
    if (result[0].affectedRows === 0) throw new TRPCError({ code: "NOT_FOUND", message: "笔记不存在" });
    return { ok: true as const };
  }),

  remove: authedProcedure.input(numericIdParamSchema).mutation(async ({ input, ctx }) => {
    const result = await db
      .delete(interviewNotes)
      .where(and(eq(interviewNotes.id, input.id), eq(interviewNotes.userId, ctx.userId)));
    if (result[0].affectedRows === 0) throw new TRPCError({ code: "NOT_FOUND", message: "笔记不存在" });
    return { ok: true as const };
  }),
});
