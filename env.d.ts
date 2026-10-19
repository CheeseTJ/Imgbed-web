/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

interface ImportMetaEnv {
  /** 后端 API 根地址。留空则走 vite 代理（开发期）。 */
  readonly VITE_API_BASE?: string
  /** Ucenter 根地址。默认线上用户中心。 */
  readonly VITE_UCENTER_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
