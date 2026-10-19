<script setup lang="ts">
/**
 * 图库主视图：投递区 + 上传队列 + 图片表格 + 详情栏。
 *
 * 状态全在 stores/gallery.ts 里，本组件只负责编排与交互提示。
 */
import { computed, onMounted, ref } from 'vue'

import { getJob, renameFolder } from '@/api/client'
import AppShell from '@/components/AppShell.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DropZone from '@/components/DropZone.vue'
import FolderTree from '@/components/FolderTree.vue'
import ImageTable from '@/components/ImageTable.vue'
import Inspector from '@/components/Inspector.vue'
import UploadQueue from '@/components/UploadQueue.vue'
import {
  breadcrumb,
  batchDelete,
  batchMove,
  clearFinished,
  clearSelection,
  enqueue,
  galleryState,
  load,
  loadFolders,
  makeFolder,
  moveTo,
  openFolder,
  renameImage,
  remove,
  removeFolder,
  select,
  selectedImage,
  toggleSelectAll,
  toggleSelectRow,
  visibleItems,
} from '@/stores/gallery'

const toast = ref('')
let toastTimer: number | undefined

function flash(msg: string) {
  toast.value = msg
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
  }, 2200)
}

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'png', label: 'PNG' },
  { key: 'jpg', label: 'JPG' },
  { key: 'gif', label: 'GIF' },
  { key: 'webp', label: 'WEBP' },
]

function onFiles(files: File[]) {
  const n = enqueue(files)
  if (n === 0) {
    flash('没有可上传的图片（只接受 jpg / png / gif / webp）')
    return
  }
  flash(`已加入 ${n} 个文件`)
}

/**
 * 待确认的删除目标。
 *
 * 不用 window.confirm，是因为原生弹窗的字体、圆角、系统配色跟终端界面没有任何
 * 共同语言，而且按钮文案固定、破坏性操作也没法给出红色警示。
 *
 * 图片与目录共用同一个弹窗：都属于「删除」这一类动作，区别只在文案与后果，
 * 没必要为此做两个几乎一样的组件。
 */
type Pending =
  | { kind: 'image'; id: string; name: string }
  | { kind: 'folder'; id: string; name: string }
  | { kind: 'batch'; ids: string[]; name: string }

const pending = ref<Pending | null>(null)

/** 弹窗文案随目标类型变化，模板只取一次，避免在 template 里堆三元表达式 */
const dialog = computed(() => {
  const p = pending.value
  if (p?.kind === 'image') {
    return {
      title: '删除图片',
      command: `rm ${p.name}`,
      message: '确认删除这张图片？',
      detail: '会先进入回收站，保留 7 天后才真正删除。',
      confirm: '删除',
    }
  }
  if (p?.kind === 'batch') {
    return {
      title: '批量删除',
      command: `rm ×${p.ids.length}`,
      message: `把这 ${p.ids.length} 张图片移入回收站？`,
      detail: '会先进入回收站，保留 7 天后才真正删除。',
      confirm: '移入回收站',
    }
  }
  return {
    title: '删除目录',
    command: p ? `rmdir ${p.name}` : '',
    message: '确认删除这个目录？',
    // 把「不会连带删除」说清楚：否则用户会担心图片跟着一起没了
    detail: '目录必须先清空。这个操作不会连带删除目录里的图片。',
    confirm: '删除目录',
  }
})

/** 点「删除」只负责打开弹窗，真正执行在 confirmedRemove 里 */
function onDelete(id: string) {
  pending.value = { kind: 'image', id, name: selectedImage.value?.filename ?? id }
}

function onRemoveFolder(id: string) {
  const folder = galleryState.folders.find((f) => f.id === id)
  pending.value = { kind: 'folder', id, name: folder?.name ?? id }
}

async function confirmedRemove() {
  const target = pending.value
  if (!target) return
  pending.value = null
  try {
    if (target.kind === 'image') {
      await remove(target.id)
      flash('已移入回收站')
    } else if (target.kind === 'folder') {
      await removeFolder(target.id)
      flash('目录已删除')
    } else {
      const res = await batchDelete(target.ids)
      if (res.failed > 0) {
        const first = res.results.find((r) => !r.ok)
        flash(
          `已移入回收站 ${res.succeeded} 张，失败 ${res.failed} 张` +
            `（${first?.error ?? '未知原因'}）`,
        )
      } else {
        flash(`已移入回收站 ${res.succeeded} 张`)
      }
    }
  } catch (e) {
    flash(e instanceof Error ? e.message : '删除失败')
  }
}

/* ==================== 批量操作 ==================== */

/** 批量移动的目录选择面板是否展开 */
const batchMoveOpen = ref(false)

/**
 * 批量移动面板的目录列表。
 *
 * 后端按 path 升序返回，天然是深度优先序，按 depth 缩进即可得到树形观感。
 */
const folderOptions = computed(() =>
  galleryState.folders.map((f) => ({ id: f.id, name: f.name, depth: f.depth })),
)

function askBatchDelete() {
  const ids = Array.from(galleryState.selectedIds)
  if (ids.length === 0) return
  pending.value = { kind: 'batch', ids, name: `${ids.length} 张图片` }
}

async function onBatchMove(folderId: string) {
  const ids = Array.from(galleryState.selectedIds)
  if (ids.length === 0) return
  batchMoveOpen.value = false
  try {
    const res = await batchMove(ids, folderId)
    if (res.failed > 0) {
      const first = res.results.find((r) => !r.ok)
      flash(`已移动 ${res.succeeded} 张，失败 ${res.failed} 张（${first?.error ?? '未知原因'}）`)
    } else {
      flash(`已移动 ${res.succeeded} 张`)
    }
  } catch (e) {
    flash(e instanceof Error ? e.message : '批量移动失败')
  }
}

/* ==================== 目录 ==================== */

async function onCreateFolder(name: string) {
  try {
    await makeFolder(name)
    flash(`已创建目录 ${name}`)
  } catch (e) {
    flash(e instanceof Error ? e.message : '创建目录失败')
  }
}

/** 进行中的目录迁移，非空时在页面上显示进度条。 */
const migrating = ref<{ jobId: string; done: number; total: number } | null>(null)

const migratePct = computed(() => {
  const m = migrating.value
  if (!m || m.total === 0) return 0
  return Math.round((m.done / m.total) * 100)
})

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

/**
 * 轮询迁移任务直到结束。
 *
 * 加了轮次上限（约 10 分钟）：迁移有 30 分钟的后端超时，
 * 但前端不该陪它跑那么久——超时就停止轮询并提示刷新，
 * 任务本身仍在后台继续，刷新后能看到最终结果。
 */
async function pollJob(jobId: string): Promise<void> {
  const maxRounds = 750
  for (let round = 0; round < maxRounds; round++) {
    await sleep(800)
    const job = await getJob(jobId)

    if (migrating.value && migrating.value.jobId === jobId) {
      migrating.value = { ...migrating.value, done: job.done, total: job.total }
    }
    if (!job.finished) continue

    migrating.value = null
    await Promise.all([loadFolders(), load()])
    if (job.status === 'failed') {
      flash(`迁移失败：${job.error || '未知原因'}`)
    } else {
      flash('目录已更新')
    }
    return
  }

  migrating.value = null
  flash('迁移仍在后台进行，稍后刷新页面查看结果')
}

async function onRenameFolder(id: string, name: string) {
  try {
    const res = await renameFolder(id, { name })
    if (res.total === 0) {
      // 没有对象需要搬，后端会立刻完成；仍走一次轮询拿到最终状态
      migrating.value = { jobId: res.job_id, done: 0, total: 0 }
    } else {
      migrating.value = { jobId: res.job_id, done: 0, total: res.total }
    }
    await pollJob(res.job_id)
  } catch (e) {
    flash(e instanceof Error ? e.message : '改名失败')
    migrating.value = null
  }
}

/** 把图片移到另一个目录（由详情栏触发）。 */
async function onMove(imageId: string, folderId: string) {
  try {
    await moveTo(imageId, folderId)
    flash('已移动')
  } catch (e) {
    flash(e instanceof Error ? e.message : '移动失败')
  }
}

/** 改展示名（由详情栏就地编辑触发）。列表由 store 原地替换，这里只管提示。 */
async function onRename(imageId: string, filename: string) {
  try {
    await renameImage(imageId, filename)
    flash('已改名')
  } catch (e) {
    flash(e instanceof Error ? e.message : '改名失败')
  }
}

// 目录树与图片列表并行拉取：两者互不依赖，串行只会让首屏多等一个往返
onMounted(() => Promise.all([loadFolders(), load()]))
</script>

<template>
  <AppShell path="">
    <!-- 命令行 + 面包屑：路径每一级都可点，直接跳回任意上级 -->
    <div class="prompt">
      <span class="u">uplink</span><span class="s">@</span><span class="u">edge-01</span
      ><span class="s">:~$</span>
      <span class="cmd">ls</span>
      <span class="path">
        <template v-for="(c, i) in breadcrumb" :key="c.id">
          <span v-if="i > 0" class="sep">/</span>
          <button
            class="crumb"
            :class="{ cur: i === breadcrumb.length - 1 }"
            type="button"
            @click="openFolder(c.id)"
          >
            {{ c.name }}
          </button>
        </template>
      </span>
    </div>

    <DropZone @files="onFiles" />

    <!-- 目录迁移进度：迁移期间置顶显示，完成后消失 -->
    <div v-if="migrating" class="migrating">
      <span class="mtxt">
        正在迁移目录… {{ migrating.done }} / {{ migrating.total }}
      </span>
      <div class="mbar"><i :style="{ width: migratePct + '%' }" /></div>
    </div>

    <UploadQueue :tasks="galleryState.queue" @clear="clearFinished" />

    <!-- 分区头 -->
    <div class="sechead">
      <h2>图库 / library</h2>
      <div class="rule" />
      <input v-model="galleryState.query" class="search" placeholder="grep 文件名…" spellcheck="false" />
      <div class="chips">
        <button
          v-for="f in FILTERS"
          :key="f.key"
          class="chip"
          :class="{ on: galleryState.filter === f.key }"
          @click="galleryState.filter = f.key"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <p v-if="galleryState.error" class="note note--err">
      <span>✗</span><span>{{ galleryState.error }}</span>
    </p>

    <!-- 批量操作条：有勾选时才出现，目录面板用于批量移动 -->
    <div v-if="galleryState.selectedIds.size > 0" class="batch">
      <span class="bcount">已选 {{ galleryState.selectedIds.size }} 张</span>
      <div class="bwrap">
        <button class="bbtn" type="button" @click="batchMoveOpen = !batchMoveOpen">
          {{ batchMoveOpen ? '收起目录' : '移动到…' }}
        </button>
        <button class="bbtn bbtn--danger" type="button" @click="askBatchDelete">删除</button>
        <button class="bbtn" type="button" @click="clearSelection">取消</button>
      </div>

      <div v-if="batchMoveOpen" class="bmove">
        <button class="brow" type="button" @click="onBatchMove('')">/ root</button>
        <button
          v-for="f in folderOptions"
          :key="f.id"
          class="brow"
          :style="{ paddingLeft: `${10 + (f.depth - 1) * 12}px` }"
          type="button"
          @click="onBatchMove(f.id)"
        >
          {{ f.name }}
        </button>
        <p v-if="folderOptions.length === 0" class="bhint">// 还没有目录，先在左侧新建</p>
      </div>
    </div>

    <ImageTable
      :items="visibleItems"
      :selected-id="galleryState.selectedId"
      :selected-ids="galleryState.selectedIds"
      :loading="galleryState.loading"
      :total="galleryState.total"
      @select="select"
      @toggle="toggleSelectRow"
      @toggle-all="toggleSelectAll"
    />

    <!-- 侧栏目录树 -->
    <template #tree>
      <FolderTree
        @open="openFolder"
        @create="onCreateFolder"
        @remove="onRemoveFolder"
        @rename="onRenameFolder"
      />
    </template>

    <!-- 详情栏 -->
    <template #inspector>
      <Inspector :image="selectedImage" @delete="onDelete" @move="onMove" @rename="onRename" />
    </template>

    <Transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Transition>

    <!--
      删除确认。目标名放在命令行里而不是正文里——既避免重复，也正好呼应
      图库页顶部那行 `uplink@edge-01:~$ ls` 的提示符。
    -->
    <ConfirmDialog
      :open="pending !== null"
      :title="dialog.title"
      :command="dialog.command"
      :message="dialog.message"
      :detail="dialog.detail"
      :confirm-label="dialog.confirm"
      danger
      @confirm="confirmedRemove"
      @cancel="pending = null"
    />
  </AppShell>
</template>

<style scoped>
.prompt {
  font-size: 12.5px;
  margin-bottom: 16px;
  white-space: nowrap;
}
.prompt .u {
  color: var(--acc);
}
.prompt .s {
  color: var(--dim);
}
.prompt .cmd {
  color: var(--fg);
  margin-left: 8px;
}

.prompt .path {
  margin-left: 6px;
}
.prompt .sep {
  color: var(--dim);
  margin: 0 1px;
}
.crumb {
  background: none;
  border: 0;
  padding: 0 1px;
  font-family: inherit;
  font-size: inherit;
  color: var(--dim-2);
  cursor: pointer;
  transition: color 0.15s;
}
.crumb:hover {
  color: var(--acc);
}
/* 当前所在目录：亮起来且不可点，避免「点了没反应」的困惑 */
.crumb.cur,
.crumb.cur:hover {
  color: var(--acc);
  cursor: default;
}

/* 目录迁移进度条 */
.migrating {
  margin-bottom: 12px;
  padding: 7px 10px;
  border: 1px solid var(--acc-dim);
  background: #0f1a15;
}
.mtxt {
  display: block;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--acc);
  margin-bottom: 5px;
}
.mbar {
  height: 4px;
  background: #0c1a13;
  overflow: hidden;
}
.mbar i {
  display: block;
  height: 100%;
  background: var(--acc);
  transition: width 0.4s ease;
}

/* 批量操作条 */
.batch {
  margin-bottom: 12px;
  padding: 7px 10px;
  border: 1px solid var(--line-2);
  background: var(--panel-2);
}
.bcount {
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--acc);
  margin-right: 12px;
}
.bwrap {
  display: inline-flex;
  gap: 1px;
  vertical-align: middle;
}
.bbtn {
  background: var(--panel);
  border: 1px solid var(--line);
  color: var(--dim-2);
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  padding: 4px 10px;
  cursor: pointer;
  transition: 0.15s;
}
.bbtn:hover {
  color: var(--fg);
  border-color: var(--line-2);
}
.bbtn--danger:hover {
  color: var(--err);
  border-color: #40201e;
  background: #1a0f0e;
}
.bmove {
  margin-top: 6px;
  border: 1px solid var(--line-2);
  background: #000;
  max-height: 220px;
  overflow-y: auto;
}
.brow {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  border-bottom: 1px solid #121618;
  color: var(--dim-2);
  font-family: inherit;
  font-size: 11px;
  padding: 6px 10px;
  cursor: pointer;
  transition: 0.12s;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.brow:last-child {
  border-bottom: 0;
}
.brow:hover {
  background: #141819;
  color: var(--fg);
}
.bhint {
  padding: 8px 10px;
  font-size: 11px;
  color: var(--dim-3);
}

.sechead {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 26px 0 12px;
  flex-wrap: wrap;
}
.sechead h2 {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--dim-2);
  white-space: nowrap;
}
.sechead .rule {
  flex: 1;
  height: 1px;
  background: var(--line);
  min-width: 16px;
}

.search {
  background: var(--panel);
  border: 1px solid var(--line);
  color: var(--fg);
  font-family: var(--mono);
  font-size: 11.5px;
  padding: 5px 10px;
  outline: none;
  width: 180px;
  transition: border-color 0.16s;
}
.search::placeholder {
  color: var(--dim-3);
}
.search:focus {
  border-color: var(--acc-mid);
}

.chips {
  display: flex;
  gap: 1px;
}
.chip {
  background: var(--panel);
  border: 1px solid var(--line);
  color: var(--dim);
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  padding: 4px 10px;
  cursor: pointer;
  transition: 0.15s;
}
.chip:hover {
  color: var(--fg);
  border-color: var(--line-2);
}
.chip.on {
  background: var(--acc);
  border-color: var(--acc);
  color: #04140c;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 42px;
  transform: translateX(-50%);
  z-index: 9500;
  background: #0f1a15;
  border: 1px solid var(--acc-dim);
  color: var(--acc);
  padding: 9px 18px;
  font-size: 11.5px;
  letter-spacing: 0.08em;
}
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.25s,
    transform 0.25s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}
</style>
