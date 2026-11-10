#!/usr/bin/env python3
"""Firecrawl 托管采集：抓取单页或搜索，输出 Markdown。

用法：
  FIRECRAWL_API_KEY=fc-xxx python3 firecrawl_client.py --file urls.txt --out out/firecrawl
  FIRECRAWL_API_KEY=fc-xxx python3 firecrawl_client.py --search "2027 德国 电机 展会"

依赖：requests；需要 Firecrawl API Key
"""
from __future__ import annotations

import argparse
import os
import sys

import requests

from common import USER_AGENT, now_iso, polite_sleep, prepare_out, read_urls, write_page, write_record

DEFAULT_BASE = "https://api.firecrawl.dev/v2"


def call(endpoint: str, payload: dict, api_key: str, base: str, timeout: float) -> dict:
    response = requests.post(
        f"{base.rstrip('/')}/{endpoint}",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "User-Agent": USER_AGENT},
        json=payload,
        timeout=timeout,
    )
    body = response.json() if response.content else {}
    if not response.ok or body.get("success") is False:
        raise RuntimeError(body.get("error") or f"Firecrawl 请求失败（{response.status_code}）")
    return body.get("data", body)


def scrape(url: str, args, api_key: str) -> dict:
    data = call("scrape", {"url": url, "formats": ["markdown"], "onlyMainContent": True}, api_key, args.base, args.timeout)
    return {
        "url": url,
        "title": data.get("metadata", {}).get("title", ""),
        "text": data.get("markdown", ""),
        "fetched_at": now_iso(),
        "status": "ok" if data.get("markdown") else "empty",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Firecrawl 采集（需要 API Key）")
    parser.add_argument("urls", nargs="*")
    parser.add_argument("--file", help="URL 列表文件")
    parser.add_argument("--search", help="搜索关键词，用结果 URL 继续抓取")
    parser.add_argument("--limit", type=int, default=5, help="搜索返回条数")
    parser.add_argument("--out", default="out/firecrawl")
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--timeout", type=float, default=60)
    parser.add_argument("--base", default=os.environ.get("FIRECRAWL_API_BASE", DEFAULT_BASE))
    args = parser.parse_args()

    api_key = os.environ.get("FIRECRAWL_API_KEY", "").strip()
    if not api_key:
        print("请设置 FIRECRAWL_API_KEY", file=sys.stderr)
        return 2

    urls = read_urls(args.file, args.urls)
    if args.search:
        data = call("search", {"query": args.search, "limit": args.limit}, api_key, args.base, args.timeout)
        urls = [item.get("url") for item in (data if isinstance(data, list) else data.get("web", [])) if item.get("url")]
    if not urls:
        parser.error("请提供 URL、--file 或 --search")

    out, pages = prepare_out(args.out)
    records = out / "records.jsonl"
    errors = out / "errors.jsonl"
    ok = 0
    for url in urls:
        polite_sleep(args.delay)
        try:
            record = scrape(url, args, api_key)
            write_record(records, record)
            if record["status"] == "ok":
                write_page(pages, url, record["title"], record["text"])
                ok += 1
            print(f"[ok] {url}")
        except Exception as error:  # noqa: BLE001
            write_record(errors, {"url": url, "error": str(error), "fetched_at": now_iso()})
            print(f"[error] {url}: {error}", file=sys.stderr)
    print(f"\n完成：{ok}/{len(urls)} 条成功，输出目录 {out.resolve()}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
