/**
 * Ucenter 认证客户端。
 *
 * 设计对齐本工作区既有的 Remind-web / Ucenter-web，要点：
 *
 *  - Ucenter **不是 OIDC**：登录就是「邮箱 + 密码 + app 标识」直接换一对令牌，
 *    没有 client_id、没有回调地址、没有授权码。
 *  - 只认 Authorization 头、不依赖 Cookie，所以令牌存 localStorage，
 *    跨域请求也不需要 credentials。
 *  - **refresh_token 是一次性的**。同一个 refresh_token 被并发使用会被服务端
 *    判为泄露并吊销整条令牌链，所以刷新必须做「单飞」——见 refreshTokens()。
 *    Ucenter 是 Ed25519 签名 JWT，各业务方拉 JWKS 本地验签即可，不必回源。
 */

import type { ApiErrorBody, LoginResponse, TokenPair, UcenterUser } from '@/types'

/** Ucenter 根地址：默认线上，可用 VITE_UCENTER_BASE 覆盖 */
export const BASE = (import.meta.env.VITE_UCENTER_BASE || 'https://ucenter.june-t.top').replace(
  /\/+$/,
  '',
)

/**
 * 本端在用户中心登记的应用标识，决定 JWT 的 aud。
 *
 * ⚠️ 这个字符串必须与两处完全一致，否则令牌会被后端拒绝：
 *    1. Ucenter Worker 的 APPS 环境变量
 *    2. Imgbed-api 的 ucenter.app 配置
 */
export const APP = 'imgbed'

/** localStorage 键名带前缀，避免与同域下的其它应用互相覆盖 */
const KEYS = {
  access: 'imgbed.access_token',
  refresh: 'imgbed.refresh_token',
  device: 'imgbed.device_id',
} as const

/* ==================== 令牌与设备号 ==================== */

function lsGet(key: string): string {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return '' // 隐私模式下 localStorage 可能不可用
  }
}

function lsSet(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* 同上，静默降级为「不持久化」 */
  }
}

export function getToken(): string {
  return lsGet(KEYS.access)
}

function getRefreshToken(): string {
  return lsGet(KEYS.refresh)
}

function setTokens(pair: Pick<TokenPair, 'access_token' | 'refresh_token'>): void {
  lsSet(KEYS.access, pair.access_token || '')
  lsSet(KEYS.refresh, pair.refresh_token || '')
}

/** 是否持有本地令牌（不代表仍然有效，有效性要问后端） */
export function hasSession(): boolean {
  return getToken() !== ''
}

/** 只清登录态，保留设备号——设备号代表「这台设备」，换账号也该延续 */
export function clearTokens(): void {
  lsSet(KEYS.access, '')
  lsSet(KEYS.refresh, '')
}

function uuid(): string {
  // 用 typeof 判断而不是直接取真值：randomUUID 只在 secure context 下存在，
  // 但类型声明里它始终都在，直接写条件会被 TS 判成「恒为真」（TS2774）。
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  // 手写 v4 兜底
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * 设备号。Ucenter 靠它把令牌归到同一台设备下，便于在「我的设备」里单独吊销，
 * 所以必须持久化——每次登录都换设备号会让设备列表迅速变成垃圾。
 */
export function deviceId(): string {
  let id = lsGet(KEYS.device)
  if (!id) {
    id = uuid()
    lsSet(KEYS.device, id)
  }
  return id
}

/* ==================== 错误 ==================== */

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as (T & ApiErrorBody) | null
  if (!res.ok) {
    const err: ApiErrorBody = data ?? {}
    throw new ApiError(
      res.status,
      err.code || err.error || 'request_failed',
      err.message || err.error || `请求失败 ${res.status}`,
    )
  }
  return data as T
}

/* ==================== 单飞刷新 ==================== */

let refreshing: Promise<void> | null = null

/**
 * 刷新令牌。同一时刻只允许一个刷新请求在飞，其余调用复用同一个 Promise。
 *
 * 为什么必须这样：refresh_token 一次性，并发复用会被服务端当成令牌泄露，
 * 结果是整条令牌链被吊销——用户会被莫名踢下线。
 * 页面上多个请求同时收到 401 是很常见的，所以这不是理论问题。
 */
export function refreshTokens(): Promise<void> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

async function doRefresh(): Promise<void> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new ApiError(401, 'no_refresh_token', '未登录')

  const res = await fetch(`${BASE}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken, app: APP }),
  })
  setTokens(await parse<TokenPair>(res))
}

/* ==================== 登录态失效回调 ==================== */

type UnauthorizedHandler = () => void

let onUnauthorized: UnauthorizedHandler = () => {}

/**
 * 注入「登录态彻底失效」的处理。
 *
 * 由 main.ts 接到 router 上。之所以用回调而不是在这里直接 import router，
 * 是为了避免 ucenter → router → stores → ucenter 的循环依赖。
 */
export function setUnauthorizedHandler(fn: UnauthorizedHandler): void {
  onUnauthorized = fn
}

/**
 * 供 XHR 路径（上传）复用的失效处理。
 *
 * 上传走 XMLHttpRequest 而不是 authFetch，但「刷新也失败」之后要做的事完全一样，
 * 所以把这段收在这里，避免两处各写一份、日后改漏一处。
 */
export function notifyUnauthorized(): void {
  clearTokens()
  onUnauthorized()
}

/* ==================== 请求出口 ==================== */

export interface RequestOptions {
  method?: string
  body?: unknown
  /** 401 时是否尝试刷新令牌后重试。登录/刷新自身的请求必须关掉，否则会死循环。 */
  retryOn401?: boolean
}

/**
 * 带认证的请求核心：注入 Bearer；401 时单飞刷新后重试原请求一次；
 * 刷新也失败则清掉登录态并触发 onUnauthorized。
 */
export async function authFetch<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, retryOn401 = true } = options

  const send = (): Promise<Response> => {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    return fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  let res = await send()

  if (res.status === 401 && retryOn401) {
    try {
      await refreshTokens()
      res = await send()
    } catch {
      clearTokens()
      onUnauthorized()
      throw new ApiError(401, 'session_expired', '登录已过期，请重新登录')
    }
  }

  return parse<T>(res)
}

/** Ucenter 接口专用出口（相对路径自动拼 BASE） */
export function ucenterFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return authFetch<T>(BASE + path, options)
}

/* ==================== 接口封装 ==================== */

/**
 * 登录。成功后令牌落盘并返回 user。
 *
 * retryOn401 关掉：登录返回 401 就是「邮箱或密码不对」，
 * 拿一个陈旧的 refresh_token 去刷新毫无意义，还会把失败原因掩盖成「登录已过期」。
 */
export async function login(email: string, password: string): Promise<UcenterUser> {
  const data = await ucenterFetch<LoginResponse>('/v1/auth/login', {
    method: 'POST',
    retryOn401: false,
    body: {
      email,
      password,
      app: APP,
      device_id: deviceId(),
      device_name: 'imgbed-web',
      platform: 'web',
    },
  })

  setTokens(data)
  if (data.device_id) lsSet(KEYS.device, data.device_id)
  return data.user
}

/** 登出：尽力通知服务端吊销刷新令牌，无论成败都清掉本地登录态 */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken()
  clearTokens()
  if (!refreshToken) return

  try {
    await fetch(`${BASE}/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    /* 旁路请求，失败不影响本地登出 */
  }
}
