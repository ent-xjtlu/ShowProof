import type { HarnessAdapter } from '../types'
import { HttpHarnessAdapter } from './httpAdapter'

/** 生产前端通过这一层连接本地 ACP 服务；页面组件不直接依赖服务端数据形状。 */
export const harnessAdapter: HarnessAdapter = new HttpHarnessAdapter()
