#!/usr/bin/env python3
"""用 Crawl4AI 批量抓取动态网页，输出 Markdown。

用法：
  python3 crawl4ai_fetch.py --file urls.txt --out out/crawl4ai

依赖：crawl4ai（需要 playwright 浏览器，首次运行会提示安装）
"""
from __future__ import annotations

import argparse
import asyncio
import sys

from common import now_iso, polite_sleep, prepare_out, read_urls, write_page, write_record


def markdown_of(result) -> str:
    value = getattr(result, "markdown", "")
    if isinstance(value, str):
        return value
    for attr in ("raw_markdown", "fit_markdown", "markdown_with_citations"):
        text = getattr(value, attr, "")
        if text:
            return text
    return str(value or "")


def title_of(result) -> str:
    metadata = getattr(result, "metadata", None) or {}
    if isinstance(metadata, dict):
        return str(metadata.get("title") or "")
    return ""


async def run(args, urls):
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    out, pages = prepare_out(args.out)
    records = out / "records.jsonl"
    errors = out / "errors.jsonl"
    ok = 0
    async with AsyncWebCrawler(config=BrowserConfig(headless=True, verbose=False)) as crawler:
        for url in urls:
            polite_sleep(args.delay)
            try:
                result = await crawler.arun(url=url, config=CrawlerRunConfig(cache_mode="BYPASS"))
                text = markdown_of(result)
                record = {
                    "url": url,
                    "title": title_of(result),
                    "text": text,
                    "fetched_at": now_iso(),
                    "status": "ok" if text.strip() else "empty",
                }
                write_record(records, record)
                if record["status"] == "ok":
                    write_page(pages, url, record["title"], text)
                    ok += 1
                print(f"[ok] {url} ({len(text)} chars)")
            except Exception as error:  # noqa: BLE001
                write_record(errors, {"url": url, "error": str(error), "fetched_at": now_iso()})
                print(f"[error] {url}: {error}", file=sys.stderr)
    print(f"\n完成：{ok}/{len(urls)} 条成功，输出目录 {out.resolve()}")
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="批量动态抓取（Crawl4AI）")
    parser.add_argument("urls", nargs="*")
    parser.add_argument("--file", help="URL 列表文件")
    parser.add_argument("--out", default="out/crawl4ai")
    parser.add_argument("--delay", type=float, default=1.0)
    args = parser.parse_args()
    urls = read_urls(args.file, args.urls)
    if not urls:
        parser.error("请提供 URL 或 --file")
    return asyncio.run(run(args, urls))


if __name__ == "__main__":
    raise SystemExit(main())
