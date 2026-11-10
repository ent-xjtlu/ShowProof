# Windows 开发指南

## 1. 前置环境

- Windows 10/11 x64
- **Node.js 24.9+**（`node -v` 确认；推荐 24 LTS）
- Git for Windows
- **Visual Studio Build Tools 2022**（勾选“使用 C++ 的桌面开发”）+ Python 3
  - 仅 `vendor/deepseek-harness` 的 `build:native-system` 需要；没有它会在原生模块编译处失败
- 建议把仓库放在**无空格、路径较短**的目录，例如 `C:\dev\domel-intel`

启用长路径（`vendor` 下依赖层级很深）：

```bat
git config --global core.longpaths true
reg add "HKLM\SYSTEM\CurrentControlSet\Control\FileSystem" /v LongPathsEnabled /t REG_DWORD /d 1 /f
```

建议关闭自动换行转换，避免脚本被改坏：

```bat
git config --global core.autocrlf false
```

## 2. 获取代码

仓库是私有的，先让仓库管理员把你的 GitHub 账号加成协作者：

```bat
git clone --recurse-submodules https://github.com/moyx782/domel-market-intelligence-web.git
cd domel-market-intelligence-web
```

如果克隆时没带子模块：

```bat
git submodule update --init --recursive
```

## 3. 安装依赖

```bat
npm install --legacy-peer-deps
```

> 必须带 `--legacy-peer-deps`：项目里 vite 8 的 peer `esbuild` 版本和根依赖不完全一致，npm 默认会 ERESOLVE。

安装 Harness 运行时依赖（应用启动 ACP 时需要）：

```bat
node node_modules/pnpm/bin/pnpm.cjs --dir vendor/deepseek-harness install --frozen-lockfile
node node_modules/pnpm/bin/pnpm.cjs --dir vendor/deepseek-harness run build:native-system
```

如果 `postinstall`（lefthook）报错，可改用：

```bat
node node_modules/pnpm/bin/pnpm.cjs --dir vendor/deepseek-harness install --frozen-lockfile --ignore-scripts
node node_modules/pnpm/bin/pnpm.cjs --dir vendor/deepseek-harness run build:native-system
```

## 4. 启动开发环境

```bat
npm run dev
```

- 前端：http://localhost:5183
- 后端：http://localhost:8787
- 首次启动会自动下载 Playwright Chromium 到 `build/playwright-browsers`（约 150 MB）；下载慢可设置 `PLAYWRIGHT_DOWNLOAD_HOST` 镜像。

登录后到「连接设置」填 DeepSeek API Key（或自定义 API）；数据写在 `data/db.json`。

## 5. 测试

```bat
npm test
```

包含接口冒烟与领域单测。测试用 `process.execPath + tsx CLI` 启动服务，Windows 下不需要 `npx.cmd`。

## 6. 桌面 / 安装包

```bat
npm run desktop:dev
```

构建 Windows 安装包：

```bat
npm run dist:win
```

产物：`release\shizheng-intel-desk-0.1.1-win-x64.exe`（NSIS）。

如果 NSIS 打包失败，可先生成免安装目录：

```bat
npx electron-builder --win dir --x64
```

产物在 `release\win-unpacked\`，压缩后即可分发。

## 7. 常见问题

| 现象 | 处理 |
| --- | --- |
| `npm install` ERESOLVE | 加 `--legacy-peer-deps` |
| 子模块为空 / `vendor` 没内容 | `git submodule update --init --recursive` |
| `build:native-system` 报缺编译器 | 安装 VS Build Tools 2022（C++）与 Python 3 |
| 端口被占用 | 设置 `PORT`（后端）或用 `npx vite --port 5184` |
| Playwright 下载失败 | 设置 `PLAYWRIGHT_DOWNLOAD_HOST`，或手动把 Chromium 放到 `build/playwright-browsers` |
| 启动后研究一直失败 | 检查「连接设置」里的 Key；Windows 防火墙允许 Node 访问网络 |
| 路径太长 | 开启 `LongPathsEnabled`，或把仓库移到更短路径 |

## 8. 安全

- `data/db.json` 含 API Key，已被 `.gitignore` 忽略，不要提交。
- `scratch/`、`.tmp*/`、`build/`、`release/` 也都被忽略。
