import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parseExamples, type ExampleCase } from "@ailab/judge-core";
import type { ProblemJudgeMeta } from "@ailab/contracts";
import { env } from "./env.js";
import { runInDocker } from "./runner.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Docker runner 冒烟（dev/judge-worker.md §8：真实 docker 环境跑两数之和 AC +
// 死循环 TLE）。docker 不可用或 algo 镜像未构建时整体跳过。
// ---------------------------------------------------------------------------

async function dockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"]);
    await execFileAsync("docker", ["image", "inspect", env.JUDGE_IMAGE]);
    return true;
  } catch {
    return false;
  }
}

const available = await dockerAvailable();
const run = available ? describe : describe.skip;

/** 两数之和的判题数据（题解示例用例 + judge_meta 形态，对齐 content-kit 产物） */
const TWO_SUM_META: ProblemJudgeMeta = {
  methodName: "twoSum",
  cppAvailable: true,
  cppParams: [
    { name: "nums", type: "vector<int>" },
    { name: "target", type: "int" },
  ],
  cppReturnType: "vector<int>",
  pythonAvailable: true,
};

const TWO_SUM_CASES: ExampleCase[] = parseExamples(
  [
    "```text",
    "输入：nums = [2,7,11,15], target = 9",
    "输出：[0,1]",
    "```",
    "",
    "```text",
    "输入：nums = [3,2,4], target = 6",
    "输出：[1,2]",
    "```",
  ].join("\n"),
);

const CPP_TWO_SUM = `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < (int)nums.size(); i++) {
            int complement = target - nums[i];
            if (seen.count(complement)) return {seen[complement], i};
            seen[nums[i]] = i;
        }
        return {};
    }
};`;

const PY_TWO_SUM = `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:
                return [seen[target - x], i]
            seen[x] = i
        return []`;

function input(cases: ExampleCase[], language: "cpp" | "python", code: string) {
  return {
    submissionId: -1,
    language,
    code,
    meta: TWO_SUM_META,
    testcases: cases.map((c) => ({ args: c.args, expected: c.expected })),
    cases,
  };
}

run("Docker runner 冒烟（真实容器）", () => {
  it("C++ 两数之和 AC", async () => {
    const result = await runInDocker(input(TWO_SUM_CASES, "cpp", CPP_TWO_SUM));
    expect(result.status).toBe("ok");
    expect(result.passed).toBe(result.total);
    expect(result.passed).toBe(2);
  }, 120_000);

  it("Python 两数之和 AC", async () => {
    const result = await runInDocker(input(TWO_SUM_CASES, "python", PY_TWO_SUM));
    expect(result.status).toBe("ok");
    expect(result.passed).toBe(2);
  }, 120_000);

  it("错误答案 WA、编译错误 CE", async () => {
    const wa = await runInDocker(
      input(TWO_SUM_CASES, "cpp", `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) { return {0, 0}; }
};`),
    );
    expect(wa.status).toBe("ok");
    expect(wa.passed).toBeLessThan(wa.total);
    expect(wa.cases[0].pass).toBe(false);

    const ce = await runInDocker(input(TWO_SUM_CASES, "cpp", "this is not c++"));
    expect(ce.status).toBe("compile_error");
    expect(ce.compileError).toBeTruthy();
  }, 120_000);

  it("死循环 TLE（单用例超时强杀）", async () => {
    const oneCase = TWO_SUM_CASES.slice(0, 1);
    const result = await runInDocker(
      input(oneCase, "cpp", `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) { while (true) {} }
};`),
    );
    expect(result.status).toBe("ok");
    expect(result.passed).toBe(0);
    expect(result.cases[0].error).toContain("超时");
  }, 120_000);

  it("无网络红线：容器内不可访问外网", async () => {
    // 借 python 一例：源码尝试 DNS 解析，无网络下 socket 抛异常 → 用例报错（非通过）
    const result = await runInDocker(
      input(TWO_SUM_CASES.slice(0, 1), "python", `class Solution:
    def twoSum(self, nums, target):
        import socket
        socket.getaddrinfo("example.com", 80)
        return [0, 1]`),
    );
    expect(result.status).toBe("ok");
    expect(result.cases[0].pass).toBe(false);
    expect(result.cases[0].error).toBeTruthy();
  }, 120_000);
});
