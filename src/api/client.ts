/**
 * 业务 API 客户端（指向 Imgbed-api）。
 *
 * ROOT 留空时走相对路径，开发期由 vite 代理转发到 127.0.0.1:18080，
 * 完全绕开 CORS；生产期由 VITE_API_BASE 指向 https://imgbed.june-t.top。
 */

import type {
  BatchAction,
  BatchResult,
  FolderItem,
  FolderListResponse,
  HealthResponse,
  ImageItem,
  ImageListResponse,
  JobStatus,
  MeResponse,
  TrashListResponse,
  Usage,
} from '@/types'

import { authFetch } from './ucenter'

const ROOT = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '')

function url(path: string): string {
  return ROOT + path
}

/**
 * 当前登录用户 + 用量。
 *
 * 后端会在这一步把用户 upsert 进影子表，所以它是「登录后第一个该调的接口」。
 */
export function fetchMe(): Promise<MeResponse> {
  return authFetch<MeResponse>(url('/api/v1/me'))
}

/** 用量统计（图片数 / 目录数 / 已用字节） */
export function fetchUsage(): Promise<Usage> {
  return authFetch<Usage>(url('/api/v1/usage'))
}

/**
 * 后端运行状态。这个接口是公开的，**刻意不走 authFetch**：
 * 它不校验令牌，走 authFetch 反而会因为携带过期令牌而触发一次无谓的刷新。
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(url('/api/health'))
  if (!res.ok) throw new Error(`健康检查失败 ${res.status}`)
  return (await res.json()) as HealthResponse
}

/* ==================== 图片 ==================== */

export interface ListImagesParams {
  folderId?: string
  page?: number
  size?: number
}

/** 分页列出图片（默认从根目录、第 1 页开始）。 */
export function listImages(params: ListImagesParams = {}): Promise<ImageListResponse> {
  const q = new URLSearchParams()
  if (params.folderId) q.set('folder_id', params.folderId)
  if (params.page) q.set('page', String(params.page))
  if (params.size) q.set('size', String(params.size))

  const qs = q.toString()
  return authFetch<ImageListResponse>(url('/api/v1/images') + (qs ? `?${qs}` : ''))
}

/** 单张图片详情。 */
export async function getImage(id: string): Promise<ImageItem> {
  const res = await authFetch<{ image: ImageItem }>(url(`/api/v1/images/${id}`))
  return res.image
}

/** 删除图片（后端是软删除，进回收站）。 */
export function deleteImage(id: string): Promise<{ ok: boolean }> {
  return authFetch<{ ok: boolean }>(url(`/api/v1/images/${id}`), { method: 'DELETE' })
}

/**
 * 把图片移动到另一个目录。
 *
 * 后端要动 R2 对象（key 里编码了目录路径），所以这不是一次纯元数据更新，
 * 失败了可以安全重试——后端把「已在目标目录」当成功返回，是幂等的。
 */
export async function moveImage(id: string, folderId: string): Promise<ImageItem> {
  const res = await authFetch<{ image: ImageItem; moved: boolean }>(url(`/api/v1/images/${id}`), {
    method: 'PATCH',
    body: { folder_id: folderId },
  })
  return res.image
}

/**
 * 改图片的展示名。
 *
 * 只改 DB 的 filename 字段——key 与 URL 由 ULID 决定，已分享出去的链接不受影响；
 * 也因此它不需要 R2 参与，失败可安全重试。同名重复提交是幂等的（renamed=false）。
 */
export async function renameImage(id: string, filename: string): Promise<ImageItem> {
  const res = await authFetch<{ image: ImageItem; moved: boolean; renamed: boolean }>(
    url(`/api/v1/images/${id}`),
    { method: 'PATCH', body: { filename } },
  )
  return res.image
}

/* ==================== 目录 ==================== */

/** 一次取回全部目录（不分页），前端据此建整棵树。 */
export function listFolders(): Promise<FolderListResponse> {
  return authFetch<FolderListResponse>(url('/api/v1/folders'))
}

/** 新建目录。parentId 传空串表示建在根目录下。 */
export async function createFolder(name: string, parentId: string): Promise<FolderItem> {
  const res = await authFetch<{ folder: FolderItem }>(url('/api/v1/folders'), {
    method: 'POST',
    body: { name, parent_id: parentId },
  })
  return res.folder
}

/** 删除目录。后端只允许删空目录，非空会返回 409。 */
export function deleteFolder(id: string): Promise<{ ok: boolean }> {
  return authFetch<{ ok: boolean }>(url(`/api/v1/folders/${id}`), { method: 'DELETE' })
}

/**
 * 目录改名 / 移动到别的父目录。
 *
 * 返回的是**任务 ID 而不是改完的目录**：迁移要搬 R2 对象，
 * 可能要跑一阵，前端拿 job_id 去轮询进度。
 */
export async function renameFolder(
  id: string,
  body: { name?: string; parent_id?: string },
): Promise<{ job_id: string; total: number }> {
  return authFetch<{ job_id: string; total: number }>(url(`/api/v1/folders/${id}`), {
    method: 'PATCH',
    body,
  })
}

/** 轮询异步任务进度。 */
export function getJob(id: string): Promise<JobStatus> {
  return authFetch<JobStatus>(url(`/api/v1/jobs/${id}`))
}

/* ==================== 回收站 ==================== */

export function listTrash(page = 1): Promise<TrashListResponse> {
  return authFetch<TrashListResponse>(url(`/api/v1/trash?page=${page}`))
}

/** 恢复一张回收站里的图片，回到它原来所在的目录。 */
export function restoreImage(id: string): Promise<{ ok: boolean }> {
  return authFetch<{ ok: boolean }>(url(`/api/v1/trash/images/${id}/restore`), {
    method: 'POST',
  })
}

/**
 * 彻底删除一张回收站图片。
 *
 * **不可逆**——R2 对象和 DB 行都会被删掉。
 * 调用处必须先让用户明确确认。
 */
export function purgeImage(id: string): Promise<{ ok: boolean }> {
  return authFetch<{ ok: boolean }>(url(`/api/v1/trash/images/${id}`), { method: 'DELETE' })
}

/** 清空回收站（无视保留期，全部物理删除）。 */
export function emptyTrash(): Promise<{ ok: boolean; purged: number }> {
  return authFetch<{ ok: boolean; purged: number }>(url('/api/v1/trash'), { method: 'DELETE' })
}

/* ==================== 批量 ==================== */

/**
 * 批量移动 / 删除（软删）/ 恢复。
 *
 * 语义是尽力而为：一张失败不影响其它张，返回值里逐张给出成败与原因，
 * 前端据此告诉用户「哪几张没成、为什么」。
 */
export function batchImages(
  action: BatchAction,
  ids: string[],
  folderId?: string,
): Promise<BatchResult> {
  return authFetch<BatchResult>(url('/api/v1/batch/images'), {
    method: 'POST',
    body: { action, ids, folder_id: folderId },
  })
}
