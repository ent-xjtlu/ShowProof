import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onUse: (text: string) => void
}

const EXAMPLES: { title: string; note: string; prompt: string }[] = [
  {
    title: '加入一个展会',
    note: 'Agent 会先查重，再写入目录；卡片会标记「Agent 添加」。',
    prompt: '把「2027 中国国际工业博览会」加入我的展会目录：2027-09-15 到 2027-09-19，上海，中国，官网 https://www.ciif-expo.com 。加入后告诉我结果。',
  },
  {
    title: '修改展会信息',
    note: '支持日期、城市、官网、展馆、匹配度、备注等字段。',
    prompt: '把展会「2027 中国国际工业博览会」的日期改成 2027-09-20 到 2027-09-24，并重新计算费用和评分。',
  },
  {
    title: '归档 / 恢复展会',
    note: '删除是软删除，进回收站后可以恢复。',
    prompt: '把展会「2027 中国国际工业博览会」移入回收站，然后告诉我怎么恢复；再把它恢复回来。',
  },
  {
    title: '查找并加入相关展会',
    note: '联网搜索 + 官网核对，合适的可以直接进目录。',
    prompt: '查一下 2027 年上半年德国和意大利的电机、自动化相关展会，列出时间、地点、官网和匹配理由；把匹配度最高的 3 个加入我的展会目录。',
  },
  {
    title: '搜集资料并保存',
    note: '网页、截图、OCR、PDF（MinerU）都可以，结果会出现在右侧文件栏。',
    prompt: '打开 2027 中国国际工业博览会官网，整理一份参展商名录摘要，把关键信息保存成 notes/ciif-2027-notes.md，并把官网链接一并记下来。',
  },
  {
    title: '用企查查核验企业',
    note: '会先提交审核；你点「同意核验」后才真正调用，不阻塞对话。',
    prompt: '用企查查核验 Domel d.o.o. 和 上海电气集团，先提交审核，不要自己编造结果。',
  },
  {
    title: '生成最终报告',
    note: '报告要求包含来源链接；系统会校验字数和占位内容。',
    prompt: '把这次调研整理成一份正式报告，包含摘要、展会清单、参展企业、成本与建议，附来源链接，保存成可下载文件。',
  },
  {
    title: '批量抓取网页（可选脚本）',
    note: '自带 Trafilatura / Crawl4AI / Scrapling / Firecrawl / Scrapy 模板；需先在本机运行 crawlers/setup.sh。',
    prompt: '列出可用的爬虫脚本，用 trafilatura 抓取 urls.txt 里的页面，输出到工作区，并把结果整理成带来源的报告。',
  },
  {
    title: '下载与导出 PDF',
    note: '右侧「文件」栏里每个 Markdown 都有「PDF」按钮；下载链接带 hash，可直接打开。',
    prompt: '把刚才生成的报告导出 PDF，并告诉我文件名。',
  },
]

export function HelpPanel({ open, onClose, onUse }: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  if (!open) return null

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied((current) => (current === id ? null : current)), 1500)
    } catch {
      setCopied(null)
    }
  }

  return (
    <>
      <button type="button" className="settings-scrim" aria-label="关闭帮助" onClick={onClose} />
      <aside className="settings-panel help-panel" aria-label="帮助与示例">
        <header className="settings-panel__head">
          <div>
            <span className="mono settings-panel__eyebrow">HELP · 帮助</span>
            <h2>怎么用拾证</h2>
          </div>
          <button type="button" className="detail__close" onClick={onClose} aria-label="关闭">×</button>
        </header>

        <div className="settings-panel__body">
          <p className="settings-panel__lead">
            拾证有两条工作线：左侧「展会助手」做企业画像、展会发现与参展企业调查；右上「对话 Agent」通过 DeepSeek Harness
            直接操作目录、查资料、核验企业与生成报告。下面的示例可以直接填进对话。
          </p>

          <div className="help-steps">
            <p className="help-steps__title mono">快速开始</p>
            <ol>
              <li>在「连接设置」填好 DeepSeek API Key（或自定义 API）。</li>
              <li>填写企业画像；已有画像可直接切到「对话 Agent」。</li>
              <li>点下面任意示例的「填入对话」，或直接输入自己的问题。</li>
            </ol>
          </div>

          <div className="settings-divider"><span className="mono">示例</span><span className="settings-field__configured">可复制 / 可填入</span></div>

          <div className="help-examples">
            {EXAMPLES.map((example, index) => {
              const id = `ex${index}`
              return (
                <article className="help-example" key={id}>
                  <div className="help-example__head">
                    <h3>{example.title}</h3>
                    <span className="help-example__note">{example.note}</span>
                  </div>
                  <p className="help-example__prompt">{example.prompt}</p>
                  <div className="help-example__actions">
                    <button type="button" className="btn btn--primary" onClick={() => onUse(example.prompt)}>填入对话</button>
                    <button type="button" className="btn btn--ghost" onClick={() => void copy(id, example.prompt)}>
                      {copied === id ? '已复制' : '复制'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="settings-divider"><span className="mono">快捷键与提示</span><span className="settings-field__configured">对话输入框</span></div>
          <dl className="help-faq">
            <dt><kbd className="help-kbd">Shift</kbd> + <kbd className="help-kbd">Enter</kbd></dt>
            <dd>发送消息；<kbd className="help-kbd">Ctrl</kbd> / <kbd className="help-kbd">⌘</kbd> + <kbd className="help-kbd">Enter</kbd> 也可以。普通 Enter 是换行。</dd>
            <dt>为什么没有企查查审核卡片？</dt>
            <dd>需要先在「连接设置」填企查查 API Key。没配置时 Agent 会直接说明「未配置」，不会生成审核单。</dd>
            <dt>文件在哪里？</dt>
            <dd>对话右侧「文件」栏。Markdown 可下载或导出 PDF；下载链接带 hash，复制到浏览器也能直接打开。</dd>
            <dt>Agent 会乱改我的目录吗？</dt>
            <dd>新增会查重；删除是软删除，可在回收站恢复；也可以在「连接设置 → Agent 能力」关闭目录写入。</dd>
            <dt>报告有什么要求？</dt>
            <dd>至少 300 字、至少 1 条来源链接、不能有「待补充」等占位内容；不满足时 Agent 会继续补充。</dd>
          </dl>

          <p className="settings-panel__foot mono">提示：示例里的日期、城市、公司名可以按需替换；涉及删除时 Agent 会先向你确认。</p>
        </div>
      </aside>
    </>
  )
}
