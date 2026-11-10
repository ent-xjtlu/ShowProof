"""批量抓取 URL 列表，输出 JSONL（url/title/text/status）。

用法：
  cd scrapy_batch
  scrapy crawl batch -a urls=../urls.example.txt -O ../out/scrapy/records.jsonl
"""
from __future__ import annotations

from pathlib import Path

import scrapy


class BatchSpider(scrapy.Spider):
    name = "batch"

    def __init__(self, urls: str = "urls.txt", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.urls_file = urls
        self.start_urls = self._load_urls(urls)

    @staticmethod
    def _load_urls(path: str) -> list[str]:
        file = Path(path)
        if not file.exists():
            raise FileNotFoundError(f"URL 列表不存在：{path}")
        urls = []
        for line in file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                urls.append(line)
        return urls

    def parse(self, response):
        try:
            import trafilatura

            text = trafilatura.extract(
                response.text,
                url=response.url,
                output_format="markdown",
                include_links=True,
                include_tables=True,
            ) or ""
        except ImportError:
            text = response.xpath("string(//body)").get() or ""

        title = (response.css("title::text").get() or "").strip()
        yield {
            "url": response.url,
            "title": title,
            "text": text,
            "status": "ok" if text.strip() else "empty",
        }
