# algo 评测镜像（dev/judge-worker.md §4）：debian slim + g++ + python3。
# 容器为哑执行器：stdin 吃 task.json，stdout 吐 results.json，
# 编译/执行/超时/截断在镜像内，输出比对在 worker（@ailab/judge-core，两端同源）。
# SQL 题（SQLite）为后续项：leetcode 数据库题的示例尚不可机器解析（judge_type=none）。
#
# APT_MIRROR：构建机在国内网络时用默认的 aliyun 镜像快得多；
# 海外构建传 --build-arg APT_MIRROR=deb.debian.org 换回官方源。
FROM debian:bookworm-slim

ARG APT_MIRROR=mirrors.aliyun.com

RUN sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends g++ python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --shell /usr/sbin/nologon judge

COPY run.py /run.py

USER judge
WORKDIR /work

ENTRYPOINT ["python3", "/run.py"]
