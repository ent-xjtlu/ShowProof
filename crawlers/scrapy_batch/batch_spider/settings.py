BOT_NAME = "batch_spider"
SPIDER_MODULES = ["batch_spider.spiders"]
NEWSPIDER_MODULE = "batch_spider.spiders"

ROBOTSTXT_OBEY = True
CONCURRENT_REQUESTS = 8
DOWNLOAD_DELAY = 0.5
RANDOMIZE_DOWNLOAD_DELAY = True
RETRY_TIMES = 2
COOKIES_ENABLED = False
TELNETCONSOLE_ENABLED = False

USER_AGENT = (
    "Mozilla/5.0 (compatible; ShizhengCrawler/1.0; "
    "+https://github.com/ent-xjtlu/domel-market-intelligence-web)"
)

FEED_EXPORT_ENCODING = "utf-8"
LOG_LEVEL = "INFO"
