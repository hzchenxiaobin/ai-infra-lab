#!/usr/bin/env python3
"""一次性评测执行器（algo 镜像内，dev/judge-worker.md §3/§4）。

协议：
  stdin  task.json   {"language": "cpp"|"python", "source": str,
                      "cases": [{"inputJson": str, "expected": str, "display": str}],
                      "compileTimeoutMs"?: int, "caseTimeoutMs"?: int}
  stdout results.json {"status": "ok"|"compile_error", "compileError"?: str,
                       "cases": [{"display", "expected", "stdout", "error", "timeout"}]}

容器是哑执行器：只做编译与逐用例执行（超时强杀、输出截断）；
输出比对（JSON 深比较/数值容差/无序数组）在 worker 侧用 @ailab/judge-core 完成，
比对规则两端必须同源，不得在本文件复刻。
"""

import json
import os
import subprocess
import sys
import tempfile

DEFAULT_COMPILE_TIMEOUT_S = 30
DEFAULT_CASE_TIMEOUT_S = 8
MAX_OUT = 8192  # 每用例 stdout 截断（输出截断红线）
MAX_ERR = 2000
MAX_COMPILE_ERR = 4000


def trunc(s, n):
    return s if len(s) <= n else s[:n]


def compile_cpp(workdir, source, timeout_s):
    """返回 (cmd, None) 或 (None, compile_error_json)"""
    src = os.path.join(workdir, "main.cpp")
    with open(src, "w", encoding="utf-8") as f:
        f.write(source)
    try:
        subprocess.run(
            ["g++", "-std=c++17", "-O2", "-o", os.path.join(workdir, "main"), src],
            capture_output=True,
            timeout=timeout_s,
            check=True,
        )
        return [os.path.join(workdir, "main")], None
    except subprocess.TimeoutExpired:
        return None, json.dumps({"status": "compile_error", "compileError": f"编译超时（>{timeout_s}s）"})
    except subprocess.CalledProcessError as e:
        err = (e.stderr or b"").decode("utf-8", "replace")
        if not err:
            err = f"g++ 退出码 {e.returncode}"
        return None, json.dumps({"status": "compile_error", "compileError": trunc(err, MAX_COMPILE_ERR)})


def main():
    task = json.load(sys.stdin)
    language = task["language"]
    cases = task.get("cases", [])
    compile_timeout_s = task.get("compileTimeoutMs", DEFAULT_COMPILE_TIMEOUT_S * 1000) / 1000
    case_timeout_s = task.get("caseTimeoutMs", DEFAULT_CASE_TIMEOUT_S * 1000) / 1000

    # /work 为 docker run --tmpfs 声明的唯一可写区；本地直跑时回退系统临时目录
    base = "/work" if os.path.isdir("/work") and os.access("/work", os.W_OK) else None
    workdir = tempfile.mkdtemp(prefix="judge-", dir=base)

    if language == "cpp":
        cmd, err = compile_cpp(workdir, task["source"], compile_timeout_s)
        if err:
            print(err)
            return
    elif language == "python":
        src = os.path.join(workdir, "main.py")
        with open(src, "w", encoding="utf-8") as f:
            f.write(task["source"])
        cmd = ["python3", src]
    else:
        print(json.dumps({"status": "compile_error", "compileError": f"不支持的语言：{language}"}))
        return

    results = []
    for c in cases:
        try:
            p = subprocess.run(
                cmd,
                input=c["inputJson"].encode("utf-8"),
                capture_output=True,
                timeout=case_timeout_s,
                cwd=workdir,
            )
            stdout = p.stdout.decode("utf-8", "replace").strip()
            stderr = p.stderr.decode("utf-8", "replace").strip()
            results.append({
                "display": c.get("display", ""),
                "expected": c["expected"],
                "stdout": trunc(stdout, MAX_OUT),
                "error": trunc(stderr, MAX_ERR) if p.returncode != 0 else None,
                "timeout": False,
            })
        except subprocess.TimeoutExpired as e:
            out = (e.stdout or b"").decode("utf-8", "replace").strip()
            results.append({
                "display": c.get("display", ""),
                "expected": c["expected"],
                "stdout": trunc(out, MAX_OUT),
                "error": f"运行超时（>{case_timeout_s:g}s）",
                "timeout": True,
            })

    print(json.dumps({"status": "ok", "cases": results}))


if __name__ == "__main__":
    main()
