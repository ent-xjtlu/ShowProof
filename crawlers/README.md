# 爬虫脚本工具箱（可选）

随应用附带的一组**可直接运行**的采集脚本模板，用于展会官网、参展商名录、行业报告等场景。脚本是原创的薄封装，依赖成熟开源项目，不复制第三方源码；每个项目保留自己的许可证与仓库地址。

> 这些脚本面向实际项目：支持批量 URL、并发、重试、去重、JSONL/Markdown 落盘，方便二次开发。  
> 只采集公开、允许采集的内容；遵守目标站点的 robots.txt、服务条款与当地法律。

## 项目选型

| 类别 | 项目 | 许可证 | 适合场景 | 本工具箱对应 |
|---|---|---|---|---|
| 通用采集 | [Scrapy](https://github.com/scrapy/scrapy) | BSD-3-Clause | 多页面递归、队列、并发、去重、长期任务 | `scrapy_batch/` |
| AI 采集 | [Crawl4AI](https://github.com/unclecode/crawl4ai) | Apache-2.0 | 动态网页 → Markdown，直接喂给 LLM | `crawl4ai_fetch.py` |
| 自适应解析 | [Scrapling](https://github.com/D4Vinci/Scrapling) | BSD-3-Clause | 站点结构不统一、元素易变 | `scrapling_fetch.py` |
| 采集服务 | [Firecrawl](https://github.com/mendableai/firecrawl) | AGPL-3.0 | 整站抓取 / 搜索 / 链接发现，API 接入 | `firecrawl_client.py` |
| 可视化 | [EasySpider](https://github.com/NaiboWang/EasySpider) | AGPL-3.0 | 不想写解析规则，图形化编排 | 不随包附带，见下文 |
| 正文提取 | [Trafilatura](https://github.com/adbar/trafilatura) | Apache-2.0 | 新闻、文章、报告正文，去导航/广告 | `trafilatura_extract.py` |

## 安装

```bash
cd crawlers
./setup.sh              # 创建 .venv 并安装核心依赖（trafilatura / requests）
# 可选：安装动态抓取与分布式采集依赖
./setup.sh --optional   # crawl4ai / scrapling / scrapy
source .venv/bin/activate
```

需要 Python 3.10+。`setup.sh` 只在本机创建虚拟环境，不影响应用本身。

## 用法

```bash
# 1) 正文提取（最轻量，推荐先用）
python3 trafilatura_extract.py --file urls.example.txt --out out/trafilatura

# 2) 动态网页 / LLM 友好 Markdown（需要 crawl4ai）
python3 crawl4ai_fetch.py --file urls.example.txt --out out/crawl4ai

# 3) 自适应解析（需要 scrapling）
python3 scrapling_fetch.py --file urls.example.txt --out out/scrapling

# 4) Firecrawl 托管服务（需要 API Key）
FIRECRAWL_API_KEY=fc-xxx python3 firecrawl_client.py --file urls.example.txt --out out/firecrawl

# 5) Scrapy 批量采集（需要 scrapy）
cd scrapy_batch
scrapy crawl batch -a urls=../urls.example.txt -O ../out/scrapy/records.jsonl
```

每个脚本都会输出：

- `records.jsonl`：一条 URL 一行，包含 `url`、`title`、`text`、`fetched_at`、`status`；
- `pages/*.md`：按 URL 生成的可读正文；
- 失败项写入 `errors.jsonl`，不会中断整批任务。

## 在应用里让 Agent 使用

1. 先在本机执行 `./setup.sh`（可选依赖按需安装）。
2. 对 Agent 说：

```text
用 crawlers/trafilatura_extract.py 抓取 urls.txt 里的页面，输出到 ./data/trafilatura，然后把结果整理成报告。
```

Agent 会通过 bash 调用脚本，产物留在本次对话工作区，可在右侧「文件」栏下载。

首次启动会把模板复制到可写的数据目录（`DATA_DIR/crawlers/`），依赖与输出都留在那里；Agent 工具 `shizheng_crawlers` 会返回实际路径与安装命令。

Agent 抓取网页时优先使用 `shizheng_fetch`（Trafilatura / Crawl4AI / Scrapling），不需要自己拼 bash 命令。

## EasySpider

EasySpider 是桌面可视化工具，不属于可随包分发的脚本库。需要时从
[GitHub Releases](https://github.com/NaiboWang/EasySpider/releases) 下载对应平台版本，
用图形界面录制采集流程，再导出数据。

## 合规与限速

- 默认串行/低并发，脚本里有 `--workers`、`--delay` 可调；不要对同一站点高频请求。
- 遵守 robots.txt；遇到登录、验证码、付费墙请停止，不要绕过。
- 采集结果仅用于内部分析；引用来源时保留原始 URL。
