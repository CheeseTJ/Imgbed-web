/**
 * 图片上传。
 *
 * 单独成文件是因为它走 **XMLHttpRequest** 而不是 fetch：
 * fetch 至今没有可靠的上传进度事件，而上传队列里的进度条必须依赖
 * `xhr.upload.onprogress`。代价是 401 刷新逻辑得在这里自己接一遍。
 */

import type { UploadResponse } from '@/types'

import { ApiError, getToken, notifyUnauthorized, refreshTokens } from './ucenter'

const ROOT = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '')

export interface UploadOptions {
  /** 上传进度回调，0–100 */
  onProgress?: (percent: number) => void
  /** 用于取消上传 */
  signal?: AbortSignal
  /** 目标目录；留空表示上传到根目录 */
  folderId?: string
}

/** 上传单张图片，返回后端写入的图片记录。 */
export function uploadImage(file: File, options: UploadOptions = {}): Promise<UploadResponse> {
  return send(file, options, true)
}

/**
 * allowRetry 只在第一次尝试时为 true。
 * 刷新令牌后重试若再次 401，说明确实登录态已废，不该无限循环。
 */
function send(file: File, options: UploadOptions, allowRetry: boolean): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    // 只在有目标目录时附加字段：根目录用空串表示，传与不传在后端等价，
    // 少一个字段就少一次 multipart 解析
    if (options.folderId) form.append('folder_id', options.folderId)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${ROOT}/api/v1/images/upload`)

    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && options.onProgress) {
        options.onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      let body: unknown = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        /* 非 JSON 响应，下面按状态码兜底 */
      }
      const parsed = body as { code?: string; message?: string } | null

      if (xhr.status >= 200 && xhr.status < 300 && body) {
        options.onProgress?.(100)
        resolve(body as UploadResponse)
        return
      }

      if (xhr.status === 401 && allowRetry) {
        refreshTokens()
          .then(() => resolve(send(file, options, false)))
          .catch(() => {
            notifyUnauthorized()
            reject(new ApiError(401, 'session_expired', '登录已过期，请重新登录'))
          })
        return
      }

      reject(
        new ApiError(
          xhr.status,
          parsed?.code || 'upload_failed',
          parsed?.message || `上传失败（HTTP ${xhr.status}）`,
        ),
      )
    }

    xhr.onerror = () => reject(new ApiError(0, 'network_error', '网络错误，上传未完成'))
    xhr.onabort = () => reject(new ApiError(0, 'aborted', '已取消'))

    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true })

    xhr.send(form)
  })
}
