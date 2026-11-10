# PDF 中文字体

`NotoSansCJK-Regular.ttc` 来自 Noto Sans CJK（SIL Open Font License 1.1），随包内置用于报告 PDF 的中文与拉丁字符渲染。

- 来源：`/usr/share/fonts/google-noto-sans-cjk-fonts/NotoSansCJK-Regular.ttc`
- 用途：`server/index.ts` 的 `applyReportFont()` 默认加载该字体（PostScript 名 `NotoSansCJKsc-Regular`），避免中文 PDF 缺字；同时覆盖数字、英文与货币符号。
- 可通过环境变量 `PDF_FONT_PATH` 指向自定义 TTF/OTF 覆盖。

替换字体时请确认授权允许随软件分发。
