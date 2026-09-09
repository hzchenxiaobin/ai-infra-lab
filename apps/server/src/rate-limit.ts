/**
 * 内存滑动窗口限流器。
 * 进程内实现，重启即清零；多实例部署不共享。
 * TODO(生产化)：换 Redis（INCR + EXPIRE 或滑动窗口 lua），多副本间共享计数。
 */
export class SlidingWindowLimiter {
  /** key → 窗口内时间戳（升序） */
  private hits = new Map<string, number[]>();

  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs: number, now: () => number = () => Date.now()) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** 允许则记录一次并返回 true；超过窗口限额返回 false */
  tryConsume(key: string): boolean {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }

  /** 当前窗口内已用次数（测试与打点用） */
  used(key: string): number {
    const cutoff = this.now() - this.windowMs;
    return (this.hits.get(key) ?? []).filter((t) => t > cutoff).length;
  }

  /** 测试用：清空 */
  reset() {
    this.hits.clear();
  }
}

// auth.sendCode 双维度限流（dev/server.md §4：开放注册下唯一的闸门）
export const emailPerMinuteLimiter = new SlidingWindowLimiter(1, 60 * 1000);
export const emailPerDayLimiter = new SlidingWindowLimiter(20, 24 * 60 * 60 * 1000);
export const ipPerHourLimiter = new SlidingWindowLimiter(30, 60 * 60 * 1000);
