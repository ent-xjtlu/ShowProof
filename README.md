# 拾证 · 展会与企业信息助手

输入企业名称、官网或主营业务，软件自动寻找相关展会、收集参展企业、判断客户/伙伴/渠道/供应商/竞品关系、估算参展费用，并给出「值不值得参加」的结论与行动清单。

内置 DeepSeek Harness（ACP），对话中的 Agent 可以直接读写展会目录、采集网页与文档、调用企查查（需用户审核）、把结果写成可下载的报告。

## 功能

- **企业画像**：主营业务、产品、客户、行业、目标市场；筛选条件（国家、年份、行业、规模、目的）；费用参数（出发城市、展位面积、人数、住宿档位）。
- **展会发现**：多轮检索行业展、专业展、国际展、区域展、采购会、论坛/峰会；按主办方、场馆排期、协会日历、上下游行业等角度补充，跨轮去重，不设固定数量上限（安全上限 120 个）。
- **参展企业调查**：读取展会官网参展商名录、赞助商与嘉宾页，结合企业官网、新闻与行业网站判断关系：潜在客户、合作伙伴、渠道商、供应商、竞争对手、关系较小；可选接入企查查 MCP 补充工商、股东、关联企业与经营风险。
- **参展判断**：按「匹配分 + 企业构成」计算综合评分，输出五档结论：建议参加、建议先观展、建议提前联系重点企业、可以参加但需确认、暂不建议参加。
- **费用估算**：展位、报名、赞助、交通、住宿、人员、运输、宣传、翻译/现场服务；输出单项区间、合计区间，以及参展 / 观展 / 拜访三种方案对比。
- **报告导出**：单展会 Markdown / PDF / CSV，包含基本情况、推荐理由、企业名单、重点客户/伙伴/竞品、费用、建议接触企业、报名时间与来源。
- **持续关注**：关注展会并复检，对比展期、报名截止、官网、参展企业名单、公开费用与重点企业动态；超过 7 天未复检会在清单顶部提醒。
- **对话 Agent（直连）**：顶栏切换到「对话 Agent」，消息原样发送到 DeepSeek Harness ACP，不拼接、不改写用户消息；只用一个独立补丁覆盖自我介绍（persona），展会助手的提示词完全不变。支持多轮上下文与 Harness 自带工具；运行中显示实时步骤，完成后每条回复可展开「执行过程」。
- **Agent 操作展会目录**：对话中的 Agent 可以查询、加入、修改、归档和恢复展会记录。新增自动查重（名称/年份/城市），修改后重算评分与费用，删除是软删除、可恢复；卡片上会标「Agent 添加」。可在「连接设置 → Agent 能力」关闭目录写入。
- **Agent 文件与报告**：Agent 在本次对话的独立工作区里写 Markdown/CSV/JSON/图片，对话右侧「文件」栏实时列出，可直接下载；Markdown 报告可一键导出 PDF（内置中文字体）。研究类任务收尾会保存报告文件。
- **文件库**：顶栏「文件」汇总所有对话工作区的文件（报告、笔记、CSV、截图、OCR 结果），按对话分组，可直接下载或导出 PDF。文件服务由应用自身提供，下载地址自动生成，不需要 Agent 手动拼 URL。
- **企查查审核**：Agent 不会直接调用企查查，而是先提交审核单；对话右侧出现「待审核 · 企查查」卡片，用户点「同意核验」后才由独立会话调用，审核过程不阻塞 Agent 或用户操作；结果保存为工作区文件并自动继续生成报告。
- **MinerU 文档解析**：Agent 可用 `mineru_parse_url` 把展会手册、参展商名录等 PDF/图片/Office/HTML 解析成 Markdown。在「连接设置」填 MinerU API Token 走标准 API（文件更大、配额更高）；不填则走免登录 Agent API（20 页 / 10MB，队列较慢）。
- **批量调查**：展会较多时可「调查全部待调查」，逐个自动调查，完成一个进入下一个。
- **赞助预算**：可在费用参数里填写计划赞助金额，计入总费用。

## 快速开始

### 环境要求

- Node.js **>= 24.9**（`scripts/stage-node-runtime.mjs` 会强制检查）
- npm（仓库使用 `package-lock` 之外的常规 npm 安装）
- 可选：打包 Linux 安装包需要 `electron-builder` 的系统依赖（AppImage / deb 常见依赖即可）

### 开发模式

```bash
npm install
npm run dev
```

- 前端：<http://localhost:5183>（Vite，`/api` 代理到 8787）
- 本机 API：<http://127.0.0.1:8787>
- 数据目录：默认 `./data`，可用 `DATA_DIR` 覆盖，例如 `DATA_DIR=/tmp/exh-smoke npm run dev:server`

首次打开创建本机账号；登录后在右上角「连接设置」选择 DeepSeek 或自定义 API（Chat Completions / Anthropic Messages / Responses），填写企业画像后开始检索。

顶栏「帮助」内置 8 个可直接填入对话的示例（加展会、改展会、归档/恢复、查资料、企查查核验、生成报告、导出 PDF），并附快捷键与常见问题。

### 桌面开发

```bash
npm run desktop:dev
```

会依次准备 Node/Playwright 运行时、构建前端与服务端，再启动 Electron。

## 配置

### 界面内配置（推荐）

右上角「连接设置」：

| 项 | 说明 |
|---|---|
| 模型连接方式 | DeepSeek，或自定义 API（协议 / Base URL / 模型 / Key） |
| 企查查 API Key | 可选；配置后启用企查查审核流程 |
| 自定义 MCP Server | 可选，JSON 形式的 Streamable HTTP 配置 |
| MinerU API Token | 可选；不填走免登录 Agent API |
| Agent 能力 | 是否允许 Agent 修改展会目录（默认开启） |

### 服务端环境变量

| 变量 | 用途 |
|---|---|
| `PORT` | API 端口，默认 8787 |
| `DATA_DIR` | 数据目录，默认 `./data` |
| `SERVE_CLIENT=1` | 由服务端托管 `dist/` 静态文件（Electron 使用） |
| `DEEPSEEK_API_KEY` | 未在界面配置时使用 |
| `QCC_MCP_API_KEY` | 企查查 HTTP MCP 的 Key |
| `QCC_MCP_SERVERS` | 自定义企查查 MCP Server JSON |
| `QCC_MCP_COMMAND` / `QCC_MCP_ARGS` / `QCC_MCP_ENV` | 以 stdio 方式挂载企查查 MCP |
| `MINERU_API_TOKEN` | MinerU 标准 API Token |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright Chromium 目录 |
| `PLAYWRIGHT_MCP_SCRIPT` | Playwright MCP 脚本路径 |
| `SHIZHENG_AGENT_MCP_SCRIPT` | 应用内 Agent MCP 脚本路径 |
| `SHIZHENG_APP_URL` | MCP 回调本机 API 的地址，默认 `http://127.0.0.1:$PORT` |
| `SHIZHENG_REPORT_FONT` | PDF 中文字体路径 |
| `SHIZHENG_TEST_MODE=1` | **仅测试**：开启签发测试用 Agent 令牌的接口 |

## 使用流程（对话 Agent）

1. 「把 2027 中国国际工业博览会加入目录，2027-09-15 到 09-19，上海」→ Agent 查重并新增。
2. 「把备注改成日期待确认」/「归档这条」/「恢复刚才那条」→ 软删除、可恢复。
3. 「用企查查核验 Domel d.o.o.」→ 右侧出现审核卡片；点「同意核验」后才调用，审核期间对话不阻塞。
4. 「整理成报告」→ Agent 调用 `shizheng_report_save`，右侧「文件」出现 Markdown，可直接下载或导出 PDF。
5. 研究类任务在企查查核验完成后会自动续跑并生成报告。

## 实现说明

### 总览

```text
React (src/)  ──HTTP──  Express (server/index.ts)  ──ACP stdio──  DeepSeek Harness
     │                        │                                        │
     │                        ├─ data/db.json                          ├─ MCP: playwright
     │                        ├─ data/agent-workspaces/<chatId>/       ├─ MCP: shizheng（应用工具）
     │                        ├─ data/screenshots/                     └─ MCP: qcc（仅审核会话）
     │                        └─ data/dsh-home/
     │
     └─ 文件下载 / PDF / 报告 / 审核卡片
```

### 前端

- `src/App.tsx`：模式切换（展会助手 / 对话 Agent）、轮询、任务状态。
- `src/components/ChatView.tsx`：消息、实时执行过程、右侧「文件 / 审核」栏、Shift+Enter 发送。
- `src/components/Markdown.tsx`：轻量 Markdown 渲染，支持 GFM 表格、代码块、引用、列表，以及字面量 `\n` 还原。
- `src/components/SettingsPanel.tsx`：模型、企查查、MinerU、Agent 能力开关。
- `src/lib/chatApi.ts`：对话、文件列表、审核决定。

### 服务端与 ACP

- `server/index.ts` 中的 `DeepSeekAcpBridge` 通过 stdio 启动 `dsh --profile acp`，使用 `session/new`、`session/prompt`、`session/update`。
- 对话会话的 `cwd` 是每个对话独立的工作区；展会调查会话仍使用仓库目录。
- 客户端会应答 ACP 的 `session/request_permission`：对话会话允许工作区内写操作，其余拒绝；沙箱本身为 `workspace-write`。
- 每个对话会话签发一次性内部令牌（2 小时），通过环境变量传给应用 MCP；令牌只能调用本机 `/api/agent/*`，不接触数据库文件与密钥。
- 对话会话挂载 Playwright MCP 与应用 MCP，**不直接挂载企查查**；审核通过后由独立会话挂载企查查执行。

### 应用内 MCP（`server/agent-mcp.mjs`）

| 工具 | 作用 |
|---|---|
| `shizheng_context` | 企业画像摘要、目录规模、工作区说明 |
| `shizheng_exhibitions_list` | 目录列表（关键词 / 状态 / 回收站） |
| `shizheng_exhibition_get` | 单条详情 |
| `shizheng_exhibition_create` | 新增（自动查重、评分、费用） |
| `shizheng_exhibition_update` | 白名单字段修改并重算 |
| `shizheng_exhibition_archive` | 软删除进回收站 |
| `shizheng_exhibition_restore` | 从回收站恢复 |
| `shizheng_file_write` | 写工作区文件，返回下载地址 |
| `shizheng_report_save` | 保存最终 Markdown 报告（校验来源/字数/占位） |
| `shizheng_files_list` | 列出本次对话可下载文件 |
| `shizheng_qcc_verify` | 提交企查查审核单（异步，不阻塞） |

### 工作区、文件与下载

- 路径：`DATA_DIR/agent-workspaces/<chatId>/`，按对话隔离；沙箱限制在该目录内。
- 单文件写入上限 5 MB；文件列表最多 200 个、深度 4 层。
- 文件服务就是应用自身（无需单独启动）：文件写入工作区后，服务端自动生成下载地址，Agent 与界面都不需要手写 URL。
- 下载地址形如 `/api/chats/<chatId>/files/download?path=...&h=<hash>`；`h` 是服务端密钥 + 对话 + 路径的 SHA-256，带 hash 的链接无需登录即可下载，同时保留登录态访问。
- `GET /api/files` 汇总当前用户所有对话工作区的文件；对话内的截图写入该对话的 `screenshots/` 子目录，因此也会出现在文件列表里。
- Markdown 报告可访问 `/api/chats/<chatId>/files/report.pdf?path=...&h=...` 导出 PDF；PDF 使用内置 `NotoSansCJK`，中文不依赖系统字体。

### 企查查审核（异步）

1. Agent 调 `shizheng_qcc_verify`，服务端创建 `pending` 审核单并立即返回。
2. Agent 结束当前轮，界面显示审核卡片；用户可继续做别的事。
3. 用户点「同意核验」→ 服务端启动独立 ACP 会话（挂载企查查 MCP）执行核验。
4. 结果写入 `qcc/verification-*.md`，追加系统消息，并自动续跑原对话生成报告。
5. 拒绝、超时、失败都会明确记录；报告标注「未核验」，不编造字段。

### 数据模型

`data/db.json` 主要集合：

- `users` / `sessions`：本机账号与登录态
- `companies`：企业画像
- `discoveries` / `exhibitions`：检索任务与展会目录（`origin` 标记 `agent`，`archivedAt` 表示回收站）
- `chats`：对话、消息、执行 trace、内部续跑消息
- `approvals`：企查查审核单
- `settings`：模型、企查查、MinerU、Agent 能力

`exhibitions` 的关键派生字段：`score`（评分）、`verdict`（结论）、`cost`（费用区间），由 `server/exhibition.ts` 的纯函数计算。

### 报告

- Agent 调用 `shizheng_report_save`，服务端校验：标题、正文 ≥300 字、至少 1 条来源链接、无占位词。
- 报告写入 `reports/`，返回 `downloadUrl` 与 `pdfUrl`。
- 单展会结构化报告仍由 `buildExhibitionReport` 生成（Markdown / PDF / CSV）。

### 打包实现

- 前端：`npm run build`（`tsc -b` + `vite build`）。
- 服务端：`npm run build:server`（esbuild 打包为 `dist-server/index.mjs`）。
- `scripts/stage-node-runtime.mjs`：复制 Node 运行时、Playwright 浏览器与 `runtime-deps/node_modules`，并把 `playwright-mcp.mjs`、`urlSafety.mjs`、`agent-mcp.mjs` 复制到 `build/playwright-runtime/`。
- Electron 的 `extraResources` 把 `node-runtime`、`pnpm`、`playwright-browsers`、`playwright-runtime`、`harness`、`fonts`、`ocr-data` 放进安装包。
- 首次启动把 Harness 源码复制到用户数据目录并执行 `pnpm install --frozen-lockfile`（需要网络）。

## 目录结构

```text
server/
  index.ts            # API、账号、发现/调查、ACP 桥、Agent 工具 API、下载/PDF
  exhibition.ts       # 领域模型、提示词契约、评分、费用、报告
  playwright-mcp.mjs  # Playwright / 截图 / OCR / MinerU MCP
  agent-mcp.mjs       # 应用内 MCP（目录、文件、报告、企查查审核）
  playwrightFetcher.ts / urlSafety.* / customProvider.ts
src/
  App.tsx / components/ / lib/ / domain.ts / workspace.css
tests/
  api-smoke.test.mjs  # 接口冒烟（7）
  agent-api.test.mjs  # Agent API（6）
  exhibition.test.ts  # 领域单测（8）
scripts/
  stage-node-runtime.mjs / build-server.mjs / ensure-playwright.mjs
electron/main.cjs     # 桌面外壳、运行时准备
assets/fonts/         # PDF 中文字体
docs/                 # 设计、分发、Windows 指南
```

## 爬虫脚本工具箱（可选）

`crawlers/` 附带 5 个可直接运行的采集模板，按引擎划分，便于二次开发：

| 脚本 | 引擎 | 许可证 | 用途 |
|---|---|---|---|
| `trafilatura_extract.py` | Trafilatura | Apache-2.0 | 批量正文提取，最轻量 |
| `crawl4ai_fetch.py` | Crawl4AI | Apache-2.0 | 动态网页 → Markdown |
| `scrapling_fetch.py` | Scrapling | BSD-3-Clause | 结构不统一页面 |
| `firecrawl_client.py` | Firecrawl | AGPL-3.0 | 托管采集/搜索（需 API Key） |
| `scrapy_batch/` | Scrapy | BSD-3-Clause | 队列、并发、重试、去重 |

```bash
cd crawlers
./setup.sh              # 核心依赖
./setup.sh --optional   # crawl4ai / scrapling / scrapy
python3 trafilatura_extract.py --file urls.example.txt --out out/trafilatura
```

每个脚本输出 `records.jsonl`、`pages/*.md` 和 `errors.jsonl`。Agent 可以先调用 `shizheng_crawlers` 获取实际路径与安装命令，再用 bash 运行；打包版脚本位于应用资源目录 `crawlers/`。

详细说明、合规与限速建议见 [crawlers/README.md](crawlers/README.md)。

## 测试

```bash
npm test
```

包含：

- `tests/api-smoke.test.mjs`：账号、连接设置、企业画像、空工作区（7）
- `tests/agent-api.test.mjs`：Agent 令牌、目录增删改/归档恢复、文件下载、路径穿越、报告校验、企查查未配置（6）
- `tests/exhibition.test.ts`：JSON 契约、角色映射、评分、费用、变化对比、报告结构（8）

单独运行：

```bash
node --test tests/agent-api.test.mjs
node --import tsx --test tests/exhibition.test.ts
```

Agent API 测试使用 `SHIZHENG_TEST_MODE=1` 签发测试令牌，不会请求真实模型。

## 构建与分发

### Linux（AppImage + deb）

```bash
npm run dist:desktop
```

等价于：准备运行时 → `npm run build` → `npm run build:server` → `electron-builder`。

### Windows（NSIS）

```bash
npm run dist:win
```

- 会下载 Windows x64 `node.exe` 与 Windows Chromium（交叉构建）。
- 建议在 Windows 主机执行以获得可用的 NSIS 安装包；Linux 交叉构建可得到 `release/win-unpacked`。

### 产物

`release/`：

- `shizheng-intel-desk-0.1.0-linux-x86_64.AppImage`
- `shizheng-intel-desk-0.1.0-linux-amd64.deb`
- Windows：`shizheng-intel-desk-0.1.0-win-x64.exe`

### GitHub Actions 发布

`.github/workflows/desktop-release.yml` 会在推送 `v*` 标签时并行构建 Linux 的 AppImage/deb 和 Windows 的 NSIS 安装包，然后自动创建或更新对应的 GitHub Release。手动运行 workflow 时只上传构建产物，不创建 Release。发布前先把 `package.json` 的版本更新为目标版本，再推送对应标签，例如：

```bash
npm version 0.1.1 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: release v0.1.1"
git tag v0.1.1
git push origin master v0.1.1
```

### 安装版首次启动

- 安装包**不包含任何账号、密码或模型密钥**；首次启动会进入「创建本机账号」。
- 早期原型遗留的明文密码账号会在启动时自动清理，不会随安装包分发。
- 解包/安装后首次启动会把 Harness 复制到用户数据目录并安装依赖，需要网络。
- 模型 Key、企查查 Key、MinerU Token 都只保存在本机；安装包不包含密钥。
- 数据位置：Electron 的 `userData` 目录（Linux 通常为 `~/.config/domel-market-intelligence-web/`，Windows 为 `%APPDATA%/domel-market-intelligence-web/`），其中的 `data/` 保存数据库与 Agent 工作区。
- 彻底重置（会删除本机账号、企业画像、展会与对话）：退出应用后删除上述 `userData` 目录，再启动即可重新创建账号。

## 数据与隐私

- 企业画像、展会、企业与报告数据保存在本机 `data/db.json`（安装版在用户数据目录）。
- Agent 工作区按对话隔离，Agent 不能访问数据库文件或其他用户数据。
- 模型密钥只保存在本机服务端，前端不直连模型、不回显密钥。
- 未配置模型凭证时，检索请求会明确返回 503 并说明原因；不会生成模拟展会、模拟企业或模拟结论。
- 企查查 MCP 为可选项；未配置时企业调查只使用公开网页，报告会标注「未核验」。

## 检索与判断规则

- **多轮检索**：一次任务最多 3 轮补充检索，直到没有新展会；按名称与官网去重。
- **深度调查**：默认自动调查匹配度最高的 3 个展会；其余可在列表中单独调查，或用「调查全部待调查」批量处理。
- **综合评分**：`0.5 × 匹配分 + 3 × 潜在客户数（上限 10 家）+ 2.5 × 伙伴/渠道数（上限 4 家）− 0.5 × 竞品数（上限 10 家）`。
- **费用**：能找到公开展位价时优先使用，其余按国内/海外行业区间与住宿档位估算，统一折算人民币；全部标注「估算」，不是主办方报价。

## 边界与故障排查

- 展会官网可能限制抓取或把名录放在登录后；取不到时会明确显示「未获取」，不会编造企业或价格。
- 费用为估算区间，实际以主办方报价为准。
- 企查查需要单独授权；没有授权时跳过工商核验。
- 端口被占用：`EADDRINUSE` 时先停止旧进程，或设置 `PORT`。
- 启动后直接出现旧账号：说明本机保留了旧的 `userData`；新版本会清理早期明文账号，若要完全重置请删除 `userData` 目录。
- 打包后 Agent 工具不可用：确认 `build/playwright-runtime/agent-mcp.mjs` 已生成，且 Electron 设置了 `SHIZHENG_AGENT_MCP_SCRIPT`。
- 首次启动卡在依赖安装：需要网络访问 npm registry；离线环境需预先准备 Harness 依赖。
- PDF 中文乱码：确认 `assets/fonts/NotoSansCJK-Regular.ttc` 存在，或设置 `SHIZHENG_REPORT_FONT`。
