#!/usr/bin/env python3
"""用 Scrapling 批量抓取，适合结构不统一的页面。

用法：
  python3 scrapling_fetch.py --file urls.txt --out out/scrapling

依赖：scrapling
"""
from __future__ import annotations

import argparse
import sys

from common import now_iso, polite_sleep, prepare_out, read_urls, write_page, write_record


def extract(page) -> tuple[str, str]:
    title = ""
    for selector in ("title::text", "h1::text"):
        try:
            found = page.css_first(selector)
            if found:
                title = found.get() if hasattr(found, "get") else str(found)
                break
        except Exception:  # noqa: BLE001
            continue
    try:
        text = page.get_all_text(ignore_tags=("script", "style", "noscript"))
    except Exception:  # noqa: BLE001
        text = getattr(page, "text", "") or str(page)
    return title.strip(), (text or "").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="批量自适应抓取（Scrapling）")
    parser.add_argument("urls", nargs="*")
    parser.add_argument("--file", help="URL 列表文件")
    parser.add_argument("--out", default="out/scrapling")
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--timeout", type=float, default=30)
    args = parser.parse_args()
    urls = read_urls(args.file, args.urls)
    if not urls:
        parser.error("请提供 URL 或 --file")

    from scrapling.fetchers import Fetcher

    out, pages = prepare_out(args.out)
    records = out / "records.jsonl"
    errors = out / "errors.jsonl"
    ok = 0
    for url in urls:
        polite_sleep(args.delay)
        try:
            page = Fetcher.get(url, timeout=args.timeout)
            title, text = extract(page)
            record = {"url": url, "title": title, "text": text, "fetched_at": now_iso(), "status": "ok" if text else "empty"}
            write_record(records, record)
            if record["status"] == "ok":
                write_page(pages, url, title, text)
                ok += 1
            print(f"[ok] {url} ({len(text)} chars)")
        except Exception as error:  # noqa: BLE001
            write_record(errors, {"url": url, "error": str(error), "fetched_at": now_iso()})
            print(f"[error] {url}: {error}", file=sys.stderr)
    print(f"\n完成：{ok}/{len(urls)} 条成功，输出目录 {out.resolve()}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
