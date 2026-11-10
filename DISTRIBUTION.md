# 拾证分发说明

## 已生成的 Linux 安装包

- `release/shizheng-intel-desk-0.1.0-linux-x86_64.AppImage`
- `release/shizheng-intel-desk-0.1.0-linux-amd64.deb`

AppImage 可以直接双击启动；`.deb` 可以用系统软件中心安装。应用内部自带前端和本地服务，不需要额外运行 Node 或 Vite。

## DeepSeek Harness ACP

应用内置 DeepSeek Harness ACP 运行文件。首次启动时，应用会在用户数据目录创建运行副本，并自动执行锁定依赖安装；安装完成后，研究请求由本地服务端通过 ACP stdio 启动 Harness。每个 ACP session 都会自动挂载内置 Playwright MCP Server，让 Agent 可以打开、读取、点击、填写、等待和分页动态网页。用户可以在 **连接设置** 中选择 DeepSeek、Chat Completions、Anthropic Messages 或 Responses，应用不会从前端直接请求模型 API。

Windows 安装包由 Windows 主机构建时会把 `node.exe` 与 pnpm 一并放入安装包，首次启动直接使用内置运行时，不要求用户预装 Node。构建机需要 Node 24.9 或更高版本。

网页抓取由 Agent 优先调用 ACP 会话内的 Playwright MCP。遇到 Agent 返回但正文不足的来源时，应用仍会使用随包提供的 Playwright Chromium 做最终回退抓取。
