import { and, eq, like, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { contents, userProgress } from "../db/schema.js";
import { authedProcedure, router } from "../trpc.js";
import type { ProgressStatus } from "@ailab/contracts";

// ---------------------------------------------------------------------------
// Learn 路径总览（dev/web.md §2：/learn 页数据源）。
// 数据全部来自 contents 表（learn:w* / learn:topic:* / paper:*），进度联 user_progress。
// ---------------------------------------------------------------------------

const DAY_RE = /^learn:w(\d{2})d(\d{2})$/;
const WEEK_RE = /^learn:w(\d{2})$/;
const TOPIC_DAY_RE = /^learn:topic:([a-z0-9-]+):d(\d+)$/;
const TOPIC_RE = /^learn:topic:([a-z0-9-]+)$/;

export interface LearnDay {
  id: string;
  day: number;
  title: string;
  url: string;
  status: ProgressStatus;
}

export interface LearnWeek {
  week: number;
  title: string;
  url: string;
  seenDays: number;
  days: LearnDay[];
}

export interface LearnTopic {
  slug: string;
  title: string;
  url: string;
  totalDays: number;
  seenDays: number;
}

export const learnRouter = router({
  overview: authedProcedure.query(async ({ ctx }) => {
    const [contentRows, progressRows] = await Promise.all([
      db
        .select({ id: contents.id, title: contents.title, url: contents.url })
        .from(contents)
        .where(
          and(
            eq(contents.status, "active"),
            or(like(contents.id, "learn:w%"), like(contents.id, "learn:topic:%"), like(contents.id, "paper:%")),
          ),
        ),
      db
        .select({ contentId: userProgress.contentId, status: userProgress.status })
        .from(userProgress)
        .where(eq(userProgress.userId, ctx.userId)),
    ]);

    const progressById = new Map(progressRows.map((r) => [r.contentId, r.status as ProgressStatus]));
    const statusOf = (id: string): ProgressStatus => progressById.get(id) ?? "unseen";

    // ---- 10 周主线：week 根页 + day 页 ----
    const weeks = new Map<number, { title: string; url: string; days: Map<number, LearnDay> }>();
    for (const row of contentRows) {
      let m = DAY_RE.exec(row.id);
      if (m) {
        const week = Number(m[1]);
        const day = Number(m[2]);
        const w = weeks.get(week) ?? { title: `Week ${week}`, url: "", days: new Map() };
        w.days.set(day, { id: row.id, day, title: row.title, url: row.url, status: statusOf(row.id) });
        weeks.set(week, w);
        continue;
      }
      m = WEEK_RE.exec(row.id);
      if (m) {
        const week = Number(m[1]);
        const w = weeks.get(week) ?? { title: `Week ${week}`, url: "", days: new Map() };
        w.title = row.title;
        w.url = row.url;
        weeks.set(week, w);
      }
    }

    const weekList: LearnWeek[] = [...weeks.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, w]) => {
        const days = [...w.days.values()].sort((a, b) => a.day - b.day);
        return {
          week,
          title: w.title,
          url: w.url,
          seenDays: days.filter((d) => d.status === "seen" || d.status === "mastered").length,
          days,
        };
      });

    // ---- 专题：root 页 + day 页（day 进度计数，不展开明细）----
    const topics = new Map<string, { title: string; url: string; days: Set<string> }>();
    for (const row of contentRows) {
      let m = TOPIC_DAY_RE.exec(row.id);
      if (m) {
        const t = topics.get(m[1]) ?? { title: m[1], url: "", days: new Set() };
        t.days.add(row.id);
        topics.set(m[1], t);
        continue;
      }
      m = TOPIC_RE.exec(row.id);
      if (m) {
        const t = topics.get(m[1]) ?? { title: m[1], url: "", days: new Set() };
        t.title = row.title;
        t.url = row.url;
        topics.set(m[1], t);
      }
    }

    const topicList: LearnTopic[] = [...topics.entries()]
      .map(([slug, t]) => ({
        slug,
        title: t.title,
        url: t.url,
        totalDays: t.days.size,
        seenDays: [...t.days].filter((id) => {
          const s = statusOf(id);
          return s === "seen" || s === "mastered";
        }).length,
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug));

    // ---- 论文精读 ----
    const papers = contentRows
      .filter((r) => r.id.startsWith("paper:"))
      .map((r) => ({ id: r.id, title: r.title, url: r.url }))
      .sort((a, b) => a.title.localeCompare(b.title));

    return { weeks: weekList, topics: topicList, papers };
  }),
});
