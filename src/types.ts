/**
 * 传输契约 —— 前端与 ACP 会话之间唯一共享的东西。
 *
 * 入站：ACP 会话返回结果的 `type` + `payload`（payload 结构由 ACP 会话决定，
 * 前端按 type 分发渲染器，不做字段级强约束）。
 * 出站：用户的所有操作都收敛成 ClientEvent，见下方联合类型。
 *
 * 这个文件不依赖任何具体适配器；页面只通过 HarnessAdapter 接收 ACP 会话事件。
 */

export type ResultType =
  | 'steps'
  | 'groups'
  | 'insights'
  | 'question'
  | 'report'
  | 'markdown'
  | 'error'

export interface TraceItem {
  kind?: 'tool' | 'step' | 'source' | 'rule'
  label: string
  detail?: string
  at?: string
}

export interface ResultMeta {
  trace?: TraceItem[]
  batch?: string
  source?: string
  [key: string]: unknown
}

export interface HarnessResult {
  /** 稳定 id；同一 id 再次返回表示“原地更新”（例如进度刷新） */
  id: string
  type: ResultType
  createdAt: string
  payload: unknown
  meta?: ResultMeta
}

export type ACPResult = HarnessResult

export type ClientEvent =
  /** 任何时刻用户输入的新问题、追问、批注 */
  | { kind: 'message'; text: string }
  /** 结果块上的动作按钮（通过 / 驳回 / 追问深挖……） */
  | {
      kind: 'action'
      resultId: string
      itemId?: string
      actionId: string
      actionLabel: string
      kindOf?: string
      note?: string
    }
  /** 提问卡片作答 */
  | { kind: 'answer'; resultId: string; values: Record<string, string> }
  /** 步骤流里“需要用户确认”的步骤 */
  | { kind: 'confirm'; resultId: string; stepId: string; decision: 'confirm' | 'skip' }
  /** 报告编辑保存 */
  | { kind: 'edit'; resultId: string; payload: unknown }

export type HarnessEvent =
  | { kind: 'status'; status: 'idle' | 'working' | 'error'; note?: string }
  | { kind: 'result'; result: HarnessResult }
  | { kind: 'error'; message: string; detail?: string; retryable?: boolean }

export type ACPEvent = HarnessEvent

export interface HarnessAdapter {
  readonly name: string
  send(event: ClientEvent): void
  subscribe(listener: (event: HarnessEvent) => void): () => void
  loadHistory?(): Promise<HistoryItem[]>
  /** 可选：清空会话时调用 */
  reset?(): void
}

export interface HistoryItem {
  id: string
  query: string
  createdAt: string
  updatedAt: string
  status: 'queued' | 'running' | 'completed' | 'failed'
}

export type StreamStatus = 'idle' | 'working' | 'error'

export interface StreamItem {
  id: string
  kind: 'user' | 'result' | 'notice'
  at: string
  text?: string
  result?: HarnessResult
  level?: 'info' | 'error'
  retryText?: string
}

/** 左栏会话记录里的一条用户输入 */
export interface Turn {
  id: string
  text: string
  at: string
}

export interface DetailView {
  id: string
  title: string
  eyebrow?: string
  excerpt?: string
  url?: string
  domain?: string
  capturedAt?: string
  batch?: string
  tags?: string[]
  trace?: TraceItem[]
  body?: string
  sourceLabel?: string
}
