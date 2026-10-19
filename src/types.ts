/** 与 Ucenter、Imgbed-api 共享的类型定义。 */

/** Ucenter 返回的用户信息 */
export interface UcenterUser {
  id: string
  email: string
  role?: string
  status?: string
  created_at?: number
}

/** Ucenter 的令牌对 */
export interface TokenPair {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  device_id: string
}

/** POST /v1/auth/login 的响应 */
export interface LoginResponse extends TokenPair {
  user: UcenterUser
}

/**
 * Cloudflare 官方 usage 接口报告的 R2 真实占用。
 *
 * used_bytes 是**计费口径**：对象本体 + 元数据，含回收站里的图。
 * 与 dashboard「指标」页那个数、也与账单一致。
 */
export interface R2Usage {
  used_bytes: number
  payload_bytes: number
  metadata_bytes: number
  object_count: number
  /** 配额（字节），进度条的分母 */
  quota_bytes: number
  /** 官方测量的时间点 */
  measured_at: string
}

/** 账户里单个 bucket 的占用快照（hover 面板的每一行） */
export interface R2BucketRow {
  name: string
  used_bytes: number
  object_count: number
  /** 是否是图床自己用的桶——侧栏存储条统计的正是它 */
  current: boolean
}

/**
 * 账户级 R2 占用汇总：**所有** bucket，不止图床这一个。
 *
 * 存储条用 r2（单桶口径），这个给 hover 面板对账用——
 * dashboard 上看到的账户级数字（比如 music 桶）在这里出现。
 */
export interface R2AccountUsage {
  buckets: R2BucketRow[]
  total_used_bytes: number
  total_object_count: number
}

/** 用量统计 */
export interface Usage {
  image_count: number
  folder_count: number
  /** 业务口径的占用：按图片元数据汇总，不含回收站 */
  used_bytes: number
  total_bytes: number
  /**
   * Cloudflare 报告的真实占用。null 表示没配 token 或上游出错，
   * 前端回退到 used_bytes。
   */
  r2: R2Usage | null
  /** 账户级汇总（全部桶）。null 同上，hover 面板随之隐藏 */
  r2_account: R2AccountUsage | null
}

/** GET /api/v1/me 的响应 */
export interface MeResponse {
  user: {
    id: string
    email: string
    role: string
    created_at?: number
    last_seen_at?: number
  }
  usage: Usage
}

/** GET /api/health 的响应 */
export interface HealthResponse {
  status: string
  ucenter: {
    base_url: string
    app: string
    jwks: { keys: number; ok: boolean; fetched_at?: number; error?: string }
  }
  r2: { configured: boolean; bucket: string; public_base: string }
  db: { ok: boolean }
}

/**
 * 统一错误体。
 * Ucenter 用 `{ code, message }`，本项目后端对齐了同一形状，
 * 这里额外兼容历史上出现过的 `{ error }` 写法。
 */
export interface ApiErrorBody {
  code?: string
  message?: string
  error?: string
}

/* ==================== 图片 ==================== */

/** 一张图片的元数据。`url` 由后端拼好，前端不自己拼域名。 */
export interface ImageItem {
  id: string
  folder_id: string
  filename: string
  ext: string
  mime: string
  size: number
  width: number
  height: number
  visibility: string
  url: string
  created_at: number
}

/** GET /api/v1/images */
export interface ImageListResponse {
  items: ImageItem[]
  total: number
  page: number
  size: number
  folder_id: string
}

/** POST /api/v1/images/upload */
export interface UploadResponse {
  image: ImageItem
  /** 内容与此前某张图完全相同，后端直接复用了旧记录（秒传） */
  duplicate: boolean
}

/** 上传任务的本地状态 */
export interface UploadTask {
  key: string
  file: File
  name: string
  size: number
  percent: number
  status: 'queued' | 'uploading' | 'done' | 'duplicate' | 'error'
  error?: string
  /**
   * 入队时就锁定的目标目录（空串 = 根目录）。
   *
   * 不在上传那一刻才读 `currentFolderId`：队列是串行的，用户完全可能
   * 在文件排队期间切走目录，那样后传的文件会被送到一个他没选过的地方。
   */
  folderId: string
}

/* ==================== 目录 ==================== */

/**
 * 一个目录。
 *
 * `path` 是从根到本目录的物化路径（不含首尾斜杠，如 `风景/2026`），
 * 由后端生成。前端靠它渲染面包屑，不必逐级查库。
 *
 * 根目录不是一个真实的记录：后端的 `parent_id` / `folder_id` 用**空串**表示
 * 根目录，所以前端也用 `''` 代表「当前在根目录」。
 */
export interface FolderItem {
  id: string
  parent_id: string
  name: string
  path: string
  /** 层级，从 1 开始；根目录下的目录 depth = 1 */
  depth: number
  created_at: number
}

/** GET /api/v1/folders —— 一次返回全部目录，前端自己建树 */
export interface FolderListResponse {
  items: FolderItem[]
}

/* ==================== 回收站 ==================== */

/** 回收站里的一条记录：一张被软删除的图片 + 到期时间。 */
export interface TrashItem {
  id: string
  folder_id: string
  filename: string
  ext: string
  mime: string
  size: number
  width: number
  height: number
  /** 软删除不动 R2 对象，所以回收站里的图仍然可以预览 */
  url: string
  /** 进入回收站的时间（Unix 秒） */
  deleted_at: number
  /** 到期时间 = deleted_at + 保留期，由后端换算好 */
  expires_at: number
  created_at: number
}

export interface TrashListResponse {
  items: TrashItem[]
  total: number
  page: number
  size: number
}

/* ==================== 异步任务 ==================== */

/** GET /api/v1/jobs/:id —— 目录迁移等异步任务的进度。 */
export interface JobStatus {
  id: string
  kind: string
  /** pending | running | done | failed */
  status: 'pending' | 'running' | 'done' | 'failed'
  total: number
  done: number
  /** 目录迁移已结束（done 或 failed），前端可以停止轮询 */
  finished: boolean
  error: string
}

/* ==================== 批量 ==================== */

export type BatchAction = 'move' | 'delete' | 'restore'

export interface BatchResult {
  ok: boolean
  succeeded: number
  failed: number
  results: { id: string; ok: boolean; error?: string }[]
}

