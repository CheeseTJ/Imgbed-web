/**
 * 登录态。
 *
 * 刻意不引入 Pinia：需求就是「一个用户对象 + 几个动作」，
 * 用 reactive 足够了，少一个依赖也少一层心智负担。
 * 约定：外部只读，改状态一律走本文件导出的动作。
 */

import { reactive } from 'vue'

import { fetchMe } from '@/api/client'
import {
  clearTokens,
  hasSession,
  login as ucenterLogin,
  logout as ucenterLogout,
} from '@/api/ucenter'
import type { Usage, UcenterUser } from '@/types'

interface AuthState {
  user: UcenterUser | null
  usage: Usage | null
  /** 后端记录的上次活跃时间（Unix 秒），用于展示会话新鲜度 */
  lastSeenAt: number | null
  /** 登录请求进行中 */
  loading: boolean
  /** 是否已尝试过用本地令牌恢复登录态（避免重复请求） */
  restored: boolean
}

export const authState = reactive<AuthState>({
  user: null,
  usage: null,
  lastSeenAt: null,
  loading: false,
  restored: false,
})

/** 拉取当前用户与用量，刷新内存态 */
export async function refresh(): Promise<void> {
  const me = await fetchMe()
  authState.user = { id: me.user.id, email: me.user.email, role: me.user.role }
  authState.usage = me.usage
  authState.lastSeenAt = me.user.last_seen_at ?? null
}

/**
 * 用本地令牌换一次 `/me`，以此确认会话是否仍然有效。
 *
 * 关键点：**不能**因为 localStorage 里有令牌就认为已登录——令牌可能早已过期，
 * 甚至可能因为服务端轮换了签名密钥而不可用。真假只有后端说了算。
 * 只在首次导航时真正发请求。
 */
export async function restore(): Promise<boolean> {
  if (authState.restored) return authState.user !== null
  authState.restored = true

  if (!hasSession()) return false

  try {
    await refresh()
    return true
  } catch {
    authState.user = null
    authState.usage = null
    return false
  }
}

export async function login(email: string, password: string): Promise<void> {
  authState.loading = true
  try {
    const user = await ucenterLogin(email, password)
    authState.user = { id: user.id, email: user.email }
    authState.restored = true
    // 拿到令牌立刻换一次 /me：既补齐用量，也让影子用户表落库
    await refresh()
  } finally {
    authState.loading = false
  }
}

export async function logout(): Promise<void> {
  await ucenterLogout()
  authState.user = null
  authState.usage = null
  authState.lastSeenAt = null
}

/** 令牌彻底失效时的兜底，由 main.ts 注入的回调调用 */
export function reset(): void {
  clearTokens()
  authState.user = null
  authState.usage = null
  authState.lastSeenAt = null
}
