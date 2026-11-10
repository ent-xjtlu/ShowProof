"""爬虫脚本共用的小工具：URL 读取、去重、落盘、限速。"""
from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse

USER_AGENT = (
    "Mozilla/5.0 (compatible; ShizhengCrawler/1.0; "
    "+https://github.com/ent-xjtlu/domel-market-intelligence-web)"
)


def read_urls(file: str | None, positional: list[str]) -> list[str]:
    urls: list[str] = []
    if file:
        for line in Path(file).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                urls.append(line)
    urls.extend(item.strip() for item in positional if item.strip())
    seen: set[str] = set()
    unique: list[str] = []
    for url in urls:
        if url not in seen:
            seen.add(url)
            unique.append(url)
    return unique


def slug(url: str) -> str:
    parsed = urlparse(url)
    host = re.sub(r"[^a-zA-Z0-9.-]+", "_", parsed.netloc or "page")
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:8]
    return f"{host}_{digest}"


def prepare_out(out: str) -> tuple[Path, Path]:
    root = Path(out)
    pages = root / "pages"
    pages.mkdir(parents=True, exist_ok=True)
    return root, pages


def write_record(path: Path, record: dict) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def write_page(pages: Path, url: str, title: str, text: str) -> None:
    body = f"# {title or url}\n\n来源：{url}\n\n{text.strip()}\n"
    (pages / f"{slug(url)}.md").write_text(body, encoding="utf-8")


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def polite_sleep(seconds: float) -> None:
    if seconds > 0:
        time.sleep(seconds)
