/**
 * 图库、目录树与上传队列的状态。
 *
 * 上传**串行**处理：并发上传会让每个请求都拿不满带宽、进度条互相争夺，
 * 在图片普遍几 MB 的场景下体验反而更差；串行还能让 R2 侧的流量更平稳。
 * 代价是总耗时可能略长，但队列里能如实看到"第几张、到哪了"，感知上更快。
 *
 * 目录树的权威数据源在后端 DB，这里只持有一份用于渲染的镜像。
 * 根目录用一个空串表示——后端也是这么约定的（parent_id/folder_id 空串 = 根）。
 */

import { computed, reactive } from 'vue'

import {
  batchImages as apiBatchImages,
  createFolder as apiCreateFolder,
  deleteFolder as apiDeleteFolder,
  deleteImage as apiDelete,
  listFolders,
  listImages,
  moveImage as apiMoveImage,
  renameImage as apiRenameImage,
  } from '@/api/client'
import { uploadImage } from '@/api/upload'
import type { BatchResult, FolderItem, ImageItem, UploadTask } from '@/types'

/** 根目录的规范表示，与后端一致 */
export const ROOT_FOLDER_ID = ''

interface GalleryState {
  items: ImageItem[]
  total: number
  loading: boolean
  /** 检索关键词，按文件名匹配 */
  query: string
  /** 类型筛选 */
  filter: string
  selectedId: string | null
  /** 批量操作勾选的图片。与 selectedId（右侧详情栏）互不影响 */
  selectedIds: Set<string>
  queue: UploadTask[]
  /** 有任务正在处理中 */
  busy: boolean
  error: string
  /** 全部目录（平铺），树形结构由组件按 parent_id 自行组装 */
  folders: FolderItem[]
  /** 当前所在目录，空串 = 根目录 */
  currentFolderId: string
}

export const galleryState = reactive<GalleryState>({
  items: [],
  total: 0,
  loading: false,
  query: '',
  filter: 'all',
  selectedId: null,
  selectedIds: new Set<string>(),
  queue: [],
  busy: false,
  error: '',
  folders: [],
  currentFolderId: ROOT_FOLDER_ID,
})

/** 经过筛选的列表。检索与筛选都在前端做——图片量在千级以内，没必要多打一次接口。 */
export const visibleItems = computed(() => {
  const q = galleryState.query.trim().toLowerCase()
  return galleryState.items.filter((im) => {
    if (q && !im.filename.toLowerCase().includes(q)) return false
    if (galleryState.filter === 'all') return true
    return im.ext.replace('.', '') === galleryState.filter
  })
})

export const selectedImage = computed(
  () => galleryState.items.find((im) => im.id === galleryState.selectedId) ?? null,
)

/** 当前目录本身；在根目录时为 null。 */
export const currentFolder = computed(
  () => galleryState.folders.find((f) => f.id === galleryState.currentFolderId) ?? null,
)

/** 面包屑，从根目录到当前目录。 */
export const breadcrumb = computed(() => {
  const trail: { id: string; name: string }[] = []

  let cursorId = galleryState.currentFolderId
  // 顺着 parent_id 往上走。这里不用递归：加了 guard 之后，
  // 即使数据异常成环也只是少显示几级，不会把渲染卡死。
  for (let guard = 0; cursorId && guard < 64; guard++) {
    const folder = galleryState.folders.find((f) => f.id === cursorId)
    if (!folder) break
    trail.unshift({ id: folder.id, name: folder.name })
    cursorId = folder.parent_id
  }

  trail.unshift({ id: ROOT_FOLDER_ID, name: 'root' })
  return trail
})

/* ==================== 加载 ==================== */

/** 拉取当前目录下的图片列表。 */
export async function load(): Promise<void> {
  galleryState.loading = true
  galleryState.error = ''
  // 列表要整体替换，旧的勾选（指向已不在列表里的图）一并清掉
  galleryState.selectedIds = new Set()
  try {
    const res = await listImages({ folderId: galleryState.currentFolderId, size: 200 })
    galleryState.items = res.items
    galleryState.total = res.total
    // 选中项若已不在列表里（比如刚被删掉或移走），清掉选中态
    if (galleryState.selectedId && !res.items.some((i) => i.id === galleryState.selectedId)) {
      galleryState.selectedId = null
    }
  } catch (e) {
    galleryState.error = e instanceof Error ? e.message : '加载图库失败'
  } finally {
    galleryState.loading = false
  }
}

/** 拉取目录树。目录列表很小，每次整体替换即可，不做增量合并。 */
export async function loadFolders(): Promise<void> {
  try {
    const res = await listFolders()
    galleryState.folders = res.items
  } catch (e) {
    galleryState.error = e instanceof Error ? e.message : '加载目录失败'
  }
}

/** 进入某个目录；传空串回根目录。 */
export async function openFolder(id: string): Promise<void> {
  if (id === galleryState.currentFolderId) return
  galleryState.currentFolderId = id
  // 换目录时清掉搜索词：带着上一次的关键词进新目录，
  // 很容易出现「明明有图却显示为空」的困惑
  galleryState.query = ''
  galleryState.selectedId = null
  await load()
}

export function select(id: string | null): void {
  galleryState.selectedId = id
}

/* ==================== 批量勾选 ==================== */

export function toggleSelectRow(id: string): void {
  const s = galleryState.selectedIds
  if (s.has(id)) s.delete(id)
  else s.add(id)
}

/** 全选/全不选，只作用于**当前可见**的行——筛选后全选不该选到被筛掉的图。 */
export function toggleSelectAll(on: boolean): void {
  if (!on) {
    galleryState.selectedIds = new Set()
    return
  }
  galleryState.selectedIds = new Set(visibleItems.value.map((i) => i.id))
}

export function clearSelection(): void {
  galleryState.selectedIds = new Set()
}

/* ==================== 目录增删 ==================== */

/** 在当前目录下新建子目录。 */
export async function makeFolder(name: string): Promise<void> {
  const created = await apiCreateFolder(name, galleryState.currentFolderId)
  galleryState.folders = [...galleryState.folders, created].sort((a, b) =>
    a.path.localeCompare(b.path),
  )
  void refreshUsage()
}

/** 删除目录。后端只允许删空目录，非空时会抛错。 */
export async function removeFolder(id: string): Promise<void> {
  const target = galleryState.folders.find((f) => f.id === id)

  await apiDeleteFolder(id)
  galleryState.folders = galleryState.folders.filter((f) => f.id !== id)

  // 删掉的正是当前所在目录时退回它的父目录，
  // 否则会停在一个已经不存在的路径上，后续上传会 400
  if (galleryState.currentFolderId === id) {
    galleryState.currentFolderId = target?.parent_id ?? ROOT_FOLDER_ID
    await load()
  }
  void refreshUsage()
}

/** 把图片移动到指定目录。 */
export async function moveTo(imageId: string, folderId: string): Promise<void> {
  const updated = await apiMoveImage(imageId, folderId)

  // 移出当前目录后它就不该继续留在列表里；
  // 移入当前目录的情形由调用方决定是否刷新，这里只处理「移走」。
  if (updated.folder_id !== galleryState.currentFolderId) {
    galleryState.items = galleryState.items.filter((i) => i.id !== imageId)
    galleryState.total = galleryState.items.length
    if (galleryState.selectedId === imageId) {
      galleryState.selectedId = galleryState.items[0]?.id ?? null
    }
  }
  // folder_count 不受影响（图片移动不改变目录数量），但 used_bytes 用于展示，
  // 刷新一次代价很低，顺带保持侧栏与后端一致
  void refreshUsage()
  }

  /** 改图片的展示名。原地替换列表项，选中态与滚动位置都保持不动。 */
  export async function renameImage(imageId: string, filename: string): Promise<void> {
  const updated = await apiRenameImage(imageId, filename)
  const idx = galleryState.items.findIndex((i) => i.id === imageId)
  if (idx !== -1) galleryState.items[idx] = updated
  // 大小与数量都没变，用量无需刷新
  }

  /* ==================== 上传 ==================== */

let taskSeq = 0
let draining = false

/** 把文件加入队列并开始处理。非图片文件在这里就被挡掉，不必浪费一次往返。 */
export function enqueue(files: File[]): number {
  const accepted = files.filter((f) => f.type.startsWith('image/'))
  if (accepted.length === 0) return 0

  // 目标目录在入队时就定下来。若拖入后用户立刻切了目录，
  // 后入队的文件不该被"顺带"传到新目录去——所见即所得。
  const folderId = galleryState.currentFolderId

  for (const file of accepted) {
    taskSeq += 1
    galleryState.queue.unshift({
      key: `t${taskSeq}-${file.name}`,
      file,
      name: file.name,
      size: file.size,
      percent: 0,
      status: 'queued',
      folderId,
    })
  }

  void drain()
  return accepted.length
}

/** 串行消费队列。 */
async function drain(): Promise<void> {
  if (draining) return
  draining = true
  galleryState.busy = true

  try {
    for (;;) {
      // 从队尾取（新任务被 unshift 到队首，所以队尾是最早加入的）
      const task = galleryState.queue.filter((t) => t.status === 'queued').pop()
      if (!task) break
      await runTask(task)
    }
  } finally {
    draining = false
    galleryState.busy = false
    // 全部结束后刷新一次列表与用量
    await Promise.all([load(), loadFolders()])
    void refreshUsage()
    // 完成后把已结束的任务淡出，避免队列一直挂在页面上
    setTimeout(() => {
      galleryState.queue = galleryState.queue.filter(
        (t) => t.status === 'uploading' || t.status === 'queued',
      )
    }, 2600)
  }
}

async function runTask(task: UploadTask): Promise<void> {
  task.status = 'uploading'
  try {
    const res = await uploadImage(task.file, {
      folderId: task.folderId,
      onProgress: (p) => {
        task.percent = p
      },
    })
    task.percent = 100
    task.status = res.duplicate ? 'duplicate' : 'done'

    // 秒传时后端返回的是已存在的记录。只有它确实落在当前目录时才插进列表，
    // 否则会把一张属于别的目录的图凭空显示在这一屏里。
    if (
      res.image.folder_id === galleryState.currentFolderId &&
      !galleryState.items.some((i) => i.id === res.image.id)
    ) {
      galleryState.items.unshift(res.image)
      galleryState.total = galleryState.items.length
      galleryState.selectedId = res.image.id
    }
  } catch (e) {
    task.status = 'error'
    task.error = e instanceof Error ? e.message : '上传失败'
  }
}

/** 清空已结束的任务。 */
export function clearFinished(): void {
  galleryState.queue = galleryState.queue.filter(
    (t) => t.status === 'queued' || t.status === 'uploading',
  )
}

/* ==================== 删除 ==================== */

export async function remove(id: string): Promise<void> {
  await apiDelete(id)
  galleryState.items = galleryState.items.filter((i) => i.id !== id)
  galleryState.total = galleryState.items.length
  if (galleryState.selectedId === id) {
    galleryState.selectedId = galleryState.items[0]?.id ?? null
  }
  galleryState.selectedIds.delete(id)
  void refreshUsage()
}

/* ==================== 批量操作 ==================== */

/** 批量删除（软删，进回收站）。 */
export async function batchDelete(ids: string[]): Promise<BatchResult> {
  const res = await apiBatchImages('delete', ids)
  galleryState.selectedIds = new Set()
  await load()
  void refreshUsage()
  return res
}

/** 批量移动到指定目录。 */
export async function batchMove(ids: string[], folderId: string): Promise<BatchResult> {
  const res = await apiBatchImages('move', ids, folderId)
  galleryState.selectedIds = new Set()
  // 移出的要消失、移入的要出现，直接重拉一次最省事
  await load()
  return res
}

/* ==================== 用量 ==================== */

let refreshUsageImpl: (() => void) | null = null

/**
 * 注册「刷新用量」的实现。
 *
 * 由 main.ts 注入认证 store 里的 refresh，避免 gallery → auth → gallery 的循环引用：
 * 上传成功后要更新侧栏配额，但 gallery 不该反过来依赖 auth 的实现细节。
 */
export function setUsageRefresher(fn: () => void): void {
  refreshUsageImpl = fn
}

function refreshUsage(): void {
  refreshUsageImpl?.()
}
