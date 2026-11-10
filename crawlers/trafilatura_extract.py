#!/usr/bin/env python3
"""批量抓取网页并用 Trafilatura 提取正文，输出 JSONL 与 Markdown。

用法：
  python3 trafilatura_extract.py --file urls.txt --out out/trafilatura
  python3 trafilatura_extract.py https://example.com --out out/one

依赖：requests, trafilatura
"""
from __future__ import annotations

import argparse
import concurrent.futures
import sys
from pathlib import Path

import requests
import trafilatura

from common import USER_AGENT, now_iso, polite_sleep, prepare_out, read_urls, write_page, write_record


def fetch_one(url: str, timeout: float, delay: float) -> dict:
    polite_sleep(delay)
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout)
    response.raise_for_status()
    html = response.text
    metadata = trafilatura.extract_metadata(html, default_url=url)
    title = getattr(metadata, "title", None) or ""
    text = trafilatura.extract(
        html,
        url=url,
        output_format="markdown",
        include_links=True,
        include_tables=True,
        favor_recall=True,
    ) or ""
    return {
        "url": url,
        "title": title,
        "text": text,
        "fetched_at": now_iso(),
        "status": "ok" if text.strip() else "empty",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="批量正文提取（Trafilatura）")
    parser.add_argument("urls", nargs="*", help="要抓取的 URL")
    parser.add_argument("--file", help="URL 列表文件，一行一个")
    parser.add_argument("--out", default="out/trafilatura", help="输出目录")
    parser.add_argument("--workers", type=int, default=2, help="并发数，默认 2")
    parser.add_argument("--delay", type=float, default=0.8, help="每个请求前的等待秒数")
    parser.add_argument("--timeout", type=float, default=30, help="请求超时秒数")
    args = parser.parse_args()

    urls = read_urls(args.file, args.urls)
    if not urls:
        parser.error("请提供 URL 或 --file")

    out, pages = prepare_out(args.out)
    records = out / "records.jsonl"
    errors = out / "errors.jsonl"
    ok = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(fetch_one, url, args.timeout, args.delay): url for url in urls}
        for future in concurrent.futures.as_completed(futures):
            url = futures[future]
            try:
                record = future.result()
                write_record(records, record)
                if record["status"] == "ok":
                    write_page(pages, url, record["title"], record["text"])
                    ok += 1
                print(f"[ok] {url} ({len(record['text'])} chars)")
            except Exception as error:  # noqa: BLE001 - 单条失败不影响整批
                write_record(errors, {"url": url, "error": str(error), "fetched_at": now_iso()})
                print(f"[error] {url}: {error}", file=sys.stderr)

    print(f"\n完成：{ok}/{len(urls)} 条成功，输出目录 {out.resolve()}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
