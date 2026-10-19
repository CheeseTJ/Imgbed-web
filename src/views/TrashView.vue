<script setup lang="ts">
/**
 * 回收站视图：查看 / 恢复 / 彻底删除。
 *
 * 与图库页共用 AppShell 外壳，但不放目录树和投递区——
 * 回收站里没有"当前目录"的概念（恢复是回原目录），也不接受新上传。
 */
import { computed, onMounted, ref } from 'vue'

import AppShell from '@/components/AppShell.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { emptyTrash, listTrash, purgeImage, restoreImage } from '@/api/client'
import { formatBytes, formatTime } from '@/utils/format'
import type { TrashItem } from '@/types'

const items = ref<TrashItem[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')

const toast = ref('')
let toastTimer: number | undefined
function flash(msg: string) {
  toast.value = msg
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
  }, 2200)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await listTrash(1)
    items.value = res.items
    total.value = res.total
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载回收站失败'
  } finally {
    loading.value = false
  }
}
onMounted(load)

/** 距离自动删除还剩几天。向上取整：剩 1 小时也算「1 天内」。 */
function daysLeft(expiresAt: number): number {
  const left = Math.ceil((expiresAt - Date.now() / 1000) / 86400)
  return Math.max(0, left)
}

/**
 * 待确认的目标。与图库页同一个弹窗组件，只是这里是「彻底删除」
 * ——不可逆，所以文案与按钮都写明，且不再有「会进回收站」的退路。
 */
const pending = ref<
  | { kind: 'purge'; id: string; name: string }
  | { kind: 'empty'; id: ''; name: '回收站全部内容' }
  | null
>(null)

const dialog = computed(() => {
  const p = pending.value
  if (p?.kind === 'purge') {
    return {
      title: '彻底删除',
      command: `rm -f ${p.name}`,
      message: '彻底删除这张图片？',
      detail: '对象与记录都会被删掉，**无法恢复**。',
      confirm: '彻底删除',
    }
  }
  return {
    title: '清空回收站',
    command: 'rm -rf trash/*',
    message: `清空回收站里的 ${total.value} 张图片？`,
    detail: '对象与记录都会被删掉，**无法恢复**。',
    confirm: '全部删除',
  }
})

function askPurge(item: TrashItem) {
  pending.value = { kind: 'purge', id: item.id, name: item.filename }
}
function askEmpty() {
  if (items.value.length === 0) return
  pending.value = { kind: 'empty', id: '', name: '回收站全部内容' }
}

async function confirmedRemove() {
  const target = pending.value
  if (!target) return
  pending.value = null
  try {
    if (target.kind === 'purge') {
      await purgeImage(target.id)
      flash('已彻底删除')
    } else {
      const res = await emptyTrash()
      flash(`已彻底删除 ${res.purged} 张`)
    }
    await load()
  } catch (e) {
    flash(e instanceof Error ? e.message : '删除失败')
  }
}

async function onRestore(item: TrashItem) {
  try {
    await restoreImage(item.id)
    flash(`已恢复 ${item.filename}`)
    await load()
  } catch (e) {
    flash(e instanceof Error ? e.message : '恢复失败')
  }
}
</script>

<template>
  <AppShell path="trash">
    <div class="prompt">
      <span class="u">uplink</span><span class="s">@</span><span class="u">edge-01</span
      ><span class="s">:~$</span>
      <span class="cmd">trash --list</span>
    </div>

    <div class="sechead">
      <h2>回收站 / trash</h2>
      <div class="rule" />
      <span class="count">{{ total }} 张</span>
      <button class="empty-btn" type="button" :disabled="total === 0" @click="askEmpty">
        清空回收站
      </button>
    </div>

    <p class="note">
      <span>i</span>
      <span>删除的图片会在这里保留 7 天，之后由系统自动彻底删除。恢复会回到它原来所在的目录。</span>
    </p>

    <p v-if="error" class="note note--err">
      <span>✗</span><span>{{ error }}</span>
    </p>

    <div class="wrap">
      <table class="files">
        <thead>
          <tr>
            <th class="c-thumb" />
            <th>文件名</th>
            <th class="c-size">大小</th>
            <th class="c-time">删除于</th>
            <th class="c-time">自动删除于</th>
            <th class="c-act">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in items" :key="t.id">
            <td>
              <img class="thumb" :src="t.url" :alt="t.filename" loading="lazy" decoding="async" />
            </td>
            <td class="name" :title="t.filename">{{ t.filename }}</td>
            <td class="num">{{ formatBytes(t.size) }}</td>
            <td class="num">{{ formatTime(t.deleted_at) }}</td>
            <td class="num" :class="{ soon: daysLeft(t.expires_at) <= 1 }">
              {{ formatTime(t.expires_at) }}（{{ daysLeft(t.expires_at) }} 天后）
            </td>
            <td class="c-act">
              <button class="op" type="button" @click="onRestore(t)">恢复</button>
              <button class="op danger" type="button" @click="askPurge(t)">彻底删除</button>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="loading && items.length === 0" class="empty">// 正在读取回收站…</p>
      <p v-else-if="items.length === 0" class="empty">// 回收站是空的</p>
    </div>

    <Transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Transition>

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

.sechead {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 12px;
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
.count {
  font-size: 11px;
  color: var(--dim-2);
}
.empty-btn {
  background: var(--panel);
  border: 1px solid var(--line);
  color: var(--dim-2);
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 5px 11px;
  cursor: pointer;
  transition: 0.16s;
}
.empty-btn:hover:not(:disabled) {
  color: var(--err);
  border-color: #40201e;
  background: #1a0f0e;
}
.empty-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.note {
  display: flex;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 11px;
  color: var(--dim-2);
  line-height: 1.6;
}
.note > span:first-child {
  color: var(--acc-mid);
  flex: none;
}
.note--err {
  color: var(--err);
}
.note--err > span:first-child {
  color: var(--err);
}

.wrap {
  min-height: 0;
}

.files {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;
}
.files th {
  text-align: left;
  font-size: 9.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--dim-3);
  padding: 0 12px 8px;
  font-weight: 500;
  border-bottom: 1px solid var(--line);
}
.files td {
  padding: 6px 12px;
  border-bottom: 1px solid #121618;
  color: var(--dim-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.files tbody tr {
  transition: background 0.12s;
}
.files tbody tr:hover {
  background: #0f1416;
}
.thumb {
  width: 34px;
  height: 24px;
  object-fit: cover;
  display: block;
  border: 1px solid var(--line-2);
  background: #000;
}
.c-thumb {
  width: 58px;
}
.c-size {
  width: 82px;
}
.c-time {
  width: 200px;
}
.c-act {
  width: 170px;
}
.name {
  color: var(--fg);
}
.num {
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
}
/* 快到期时用红色提醒，别让用户在不知情中丢图 */
.num.soon {
  color: var(--err);
}

.op {
  background: var(--panel);
  border: 1px solid var(--line);
  color: var(--dim-2);
  font-family: inherit;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 8px;
  cursor: pointer;
  transition: 0.15s;
}
.op:hover {
  color: var(--acc);
  border-color: var(--acc-dim);
}
.op.danger:hover {
  color: var(--err);
  border-color: #40201e;
  background: #1a0f0e;
}

.empty {
  padding: 34px 12px;
  text-align: center;
  color: var(--dim-3);
  font-size: 12px;
  letter-spacing: 0.02em;
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
