# 拾证 · 展会与企业信息助手 · 交付说明

版本：0.1.0  
交付日期：2026-11-10  
代码位置：`/home/sfwh/infoboard/domel-market-intelligence-web`

## 一、交付物

| 平台 | Release 附件 |
| --- | --- |
| Linux x86_64 | `shizheng-intel-desk-0.1.0-linux-x86_64.AppImage` |
| Debian / Ubuntu amd64 | `shizheng-intel-desk-0.1.0-linux-amd64.deb` |
| Windows x64 | `shizheng-intel-desk-0.1.0-win-x64.exe` |

每次发布的 SHA-256 校验值随安装包保存在同一 Release 的 `SHA256SUMS` 文件中。在 Windows 主机上也可以自行构建安装包。

```bash
npm ci --legacy-peer-deps
npm run dist:win
```

产物为 `release/shizheng-intel-desk-0.1.0-win-x64.exe`（NSIS，one-click，非 per-machine）。构建脚本会自动准备 Windows x64 Node 运行时与 Playwright Chromium。

### CI 发布

GitHub Actions 工作流位于 `.github/workflows/desktop-release.yml`。推送 `v*` 标签后，Linux 和 Windows runner 会并行构建安装包，随后把产物发布到对应的 GitHub Release。手动运行工作流只保留构建产物，适合先检查包内容。

## 二、安装与首次启动

Linux：

```bash
chmod +x release/shizheng-intel-desk-0.1.0-linux-x86_64.AppImage
./release/shizheng-intel-desk-0.1.0-linux-x86_64.AppImage
# 或
sudo dpkg -i release/shizheng-intel-desk-0.1.0-linux-amd64.deb
```

- 首次启动会在用户数据目录准备 Harness 运行副本并安装锁定依赖，**需要联网**。
- 首次使用创建本机账号（邮箱 + 8 位以上密码）。
- 右上角「连接设置」选择 DeepSeek 或自定义 API（Chat Completions / Anthropic Messages / Responses），填写密钥；可选填企查查 API Key。
- 未配置模型凭证时，点「开始找展会」会明确返回 503 并说明原因，不会生成模拟数据。

## 三、功能清单（对应需求）

| 需求 | 实现 |
| --- | --- |
| 了解企业 | 企业画像：名称、官网、主营业务、产品、客户、行业、目标市场；筛选：国家、年份、行业、规模、目的；费用参数：出发城市、展位面积、人数、住宿档位、赞助预算 |
| 找展会 | 多轮检索（最多 3 轮，可「再找一轮」继续）行业展/专业展/国际展/区域展/采购会/论坛/峰会，按名称与官网去重，不设固定数量上限（安全上限 120）；候选展会逐轮出现；收录名称、类型、时间、地点、展馆、主办方、主题、展品范围、参展方式、报名截止、官网、公开费用 |
| 参展企业名单 | 读取展会官网参展商名录、赞助商、嘉宾页；记录企业名称、官网、国家、展位号 |
| 调查企业 | 公开网页 + 企查查 MCP（可选）核实；分六类：潜在客户、合作伙伴、渠道商、供应商、竞争对手、关系较小；附判断理由与置信度 |
| 是否值得参加 | 综合评分 + 五档结论：建议参加 / 建议先观展 / 建议提前联系重点企业 / 可参加但需确认 / 暂不建议；并给出建议方式（参展 / 观展 / 只拜访） |
| 费用估算 | 展位、报名、赞助、交通、住宿、人员、运输、宣传、翻译/现场；单项区间、合计区间、参展/观展/拜访三方案对比；统一人民币估算 |
| 报告 | 单展会 Markdown / PDF / CSV：基本情况、推荐理由、企业名单、重点客户/伙伴/竞品、费用、建议接触企业、报名时间、来源 |
| 持续更新 | 关注 + 复检：展期、报名截止、官网、企业名单、公开费用、重点企业动态的变化记录；关注超过 7 天未复检在清单顶部提醒；可「再找一轮」补充新展会 |

其他：批量调查（调查全部待调查）、最近检索记录、企业画像修改后费用按新参数重算、PDF 内置中文字体、Playwright 截图与中英文 OCR（图片/画布页面）、MinerU 文档解析（`mineru_parse_url`，PDF/图片/Office/HTML → Markdown）、直连 Harness 的「对话 Agent」模式（消息原样转发；仅用独立补丁覆盖自我介绍 persona，展会提示词未改）。

## 四、验证记录

- `npm test`：15 项全部通过（接口冒烟 7 项 + 领域单测 8 项）。
- 生产构建：`npm run build` 通过；`npm run build:server` 通过。
- 安装包冒烟：解包 AppImage 后运行包内服务，页面 200、登录 200、报告 PDF 200；PDF 中文、展会类型、赞助费、建议方式、公开报价均正常渲染。
- 安装包内的 Playwright MCP 与 OCR：从 `release/linux-unpacked/resources` 直接启动 MCP，`browser_open` 与 `browser_ocr` 均成功（修复了此前 node_modules 未随包分发的问题）。
- 安装包内的直连对话：用 `release/linux-unpacked/resources` 启动服务，创建对话并发送「只回复字母 ok」，返回「ok」；多轮上下文正常，消息原样转发、不拼接提示词。
- 安装包内的 Playwright MCP 工具清单包含 `mineru_parse_url`，`fflate` 已随运行时打包。
- MinerU 标准 API（配置 Token）：用演示 PDF 端到端解析成功，返回 50,852 字符 Markdown；免登录 Agent API 在本机网络下排队较慢，已把等待上限设为 2 分钟。
- 对话过程展示：运行中显示实时步骤；完成后每条回复带可展开的「执行过程（N 步）」，已验证 6 步的工具调用链。
- **真实 DeepSeek 运行（2026-11-10）**：3 轮检索得到 41 个真实候选展会；自动详查 3 个（Vision Shanghai 36 家企业、Automechanika Shanghai 30 家、AMTS 2027 36 家），结论分别为「提前联系重点企业 / 建议参加 / 建议参加」；Markdown 与 PDF 报告正常。全程约 35 分钟，模型调用量较大。
- 费用估算、评分、结论、JSON 契约、变化对比、报告结构均有单测覆盖。

## 五、数据与边界

- 应用数据保存在 Electron 用户数据目录下的 `data/db.json`；模型密钥只在本机服务端，前端不回显。
- 展会官网可能限制抓取或把名录放在登录后；取不到时明确显示「未获取」，不编造企业或价格。
- 费用是行业区间估算，不是主办方报价；可在企业画像里调整参数，读取时按最新参数重算。
- 安装包未做代码签名；Linux 首次运行 AppImage 可能需要 `chmod +x`。
- 交叉构建 Windows NSIS 时，electron-builder 在压缩超大目录（>1 GB）时可能报 `RangeError: Invalid string length`；建议在 Windows 主机上直接执行 `npm run dist:win`（脚本已就绪）。

## 六、目录速览

- `server/exhibition.ts`：领域模型、Agent JSON 契约、费用/评分/报告纯函数。
- `server/index.ts`：企业画像、发现任务、调查流水线、报告导出、ACP/Playwright/企查查。
- `src/`：React 工作区（企业画像、展会清单、详情、检索进度、设置）。
- `assets/fonts/NotoSansCJK-Regular.ttc`：PDF 中文字体（SIL OFL 1.1）。
- `tests/`：接口冒烟与领域单测。
