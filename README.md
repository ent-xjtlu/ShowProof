# Domel Market Intelligence

一个可运行的市场情报工作台：登录、研究任务、Agent 连续操作列、来源与证据、连续追问、内嵌洞察审核、企业核验入口和 Markdown/PDF 报告导出。

## 启动

```bash
npm install
npm run dev
```

打开 http://localhost:5183。首次启动先创建本机账号，登录后进入右上角“连接设置”选择 DeepSeek 或自定义 API。

## DeepSeek Harness + ACP + MCP

项目已拉取官方 `deepseek-ai/deepseek-harness` 到 `vendor/deepseek-harness`，并执行了其锁定依赖安装。后端通过 ACP stdio 启动 Harness；每次创建 ACP session 时都会自动挂载内置 `playwright` MCP Server，因此 Agent 可以在同一 ACP 会话中打开网页、读取动态正文、点击、填写、等待、分页和提取链接。配置企查查后，它的 Streamable HTTP MCP Server 也会加入同一会话。项目同时拉取了官方 `dsh-mcp-connector` 插件源码到 `vendor/dsh-mcp-connector`。首次安装后需要按官方脚本构建当前平台原生模块：`pnpm --dir vendor/deepseek-harness run build:native-system`。项目隔离的 `data/dsh-home` 已安装 `dsh-mcp-connector` 到 `web` profile；重建时可执行 `DSH_HOME="$PWD/data/dsh-home" pnpm --dir vendor/deepseek-harness dsh plugin --profile web add "$PWD/vendor/dsh-mcp-connector"`。

运行示例：

```bash
npm run dev
# 浏览器中登录 → 连接设置 → 选择 DeepSeek 或自定义 API → 保存
```

连接设置支持 Chat Completions、Anthropic Messages 和 Responses 协议。自定义 API 的 Base URL、模型和密钥会保存到本机服务端，并由 DeepSeek Harness ACP 进程使用。

企查查官方接入指南提供 10 个 HTTP Server（企业、风控、知产、经营、历史、董监高、法规、司法、标讯、文档），设置 `QCC_MCP_API_KEY` 后，后端会自动生成这些端点并以 Bearer Token 连接。DeepSeek Harness 自己的模型凭证在 `DSH_HOME` 内按官方方式配置。缺少 Harness 或企查查 MCP 配置时，接口会明确报错，不会生成模拟来源、模拟进度或模拟洞察。

Agent 会优先使用普通网页来源，遇到 JavaScript 渲染、访问拦截、分页或正文不完整时，可以直接调用同一 ACP 会话内的 `playwright` MCP 工具。服务端还保留最终来源的 Playwright 回退读取，避免 Agent 没有返回完整 URL 时丢失动态正文。桌面安装包内含 Chromium，构建脚本会自动准备浏览器资源。

## Docker

```bash
docker compose up --build
```

## 真实验收边界

官方 Harness 已下载并可启动 ACP 服务；真实研究需要在前端“连接设置”中完成模型配置。企查查企业核验是可选能力，启用时通过环境变量配置 QCC MCP。未配置模型授权前，研究请求会被阻止并显示原因。

## 桌面分发

构建可直接安装的 Linux 包：

```bash
npm run dist:desktop
```

产物位于 `release/`：

- `shizheng-intel-desk-0.1.0-linux-x86_64.AppImage`：双击或直接运行即可使用。
- `shizheng-intel-desk-0.1.0-linux-amd64.deb`：在 Debian/Ubuntu 系统中点击安装。

应用首次打开后创建本机账号，在右上角“连接设置”选择模型连接方式。研究请求只通过内置 DeepSeek Harness 的 ACP stdio 会话执行；应用首次启动会把 Harness 运行文件复制到用户数据目录，并自动安装锁定依赖。密钥保存在本机应用数据目录，前端不会直连模型服务。

Windows/macOS 安装包可在对应系统上运行同一条 `npm run dist:desktop` 生成（electron-builder 会按宿主系统选择 NSIS 或 DMG 目标）。

桌面构建要求 Node 24.9+。构建脚本会把当前 Node 运行时和 pnpm 一并放入安装包；Windows 用户首次启动时不需要另装 Node，应用会使用内置 `node.exe` 启动 ACP 并自动安装 Harness 依赖。
