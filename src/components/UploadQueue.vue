<script setup lang="ts">
/**
 * 上传队列。进度用方块字符渲染（`████░░`），刻意不用进度条组件——
 * 字符块在等宽字体下天然对齐，一屏之内能同时看清「哪个在传、传到哪了」，
 * 而且没有任何动画，不会跟页面其它动静抢注意力。
 */
import { computed } from 'vue'

import type { UploadTask } from '@/types'
import { formatBytes } from '@/utils/format'

const props = defineProps<{ tasks: UploadTask[] }>()

const emit = defineEmits<{ clear: [] }>()

const BLOCKS = 22

const finished = computed(
  () => props.tasks.filter((t) => t.status !== 'queued' && t.status !== 'uploading').length,
)

/** 把百分比转成 `████░░` 形态。 */
function bar(percent: number): string {
  const filled = Math.round((percent / 100) * BLOCKS)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, BLOCKS - filled))
}

const LABEL: Record<UploadTask['status'], string> = {
  queued: 'queued',
  uploading: 'upload',
  done: 'done',
  duplicate: 'dup',
  error: 'failed',
}
</script>

<template>
  <div v-if="tasks.length" class="queue">
    <div class="qhead">
      <span>上传队列 · {{ tasks.length }} 项</span>
      <button v-if="finished" class="btn-ghost" @click="emit('clear')">清空已完成</button>
    </div>

    <div v-for="t in tasks" :key="t.key" class="qrow" :class="t.status">
      <span class="nm" :title="t.name">{{ t.name }}</span>
      <span class="sz">{{ formatBytes(t.size) }}</span>
      <span class="blocks">{{ bar(t.percent) }}</span>
      <span class="pct">{{ String(t.percent).padStart(3, ' ') }}%</span>
      <span class="st">{{ LABEL[t.status] }}</span>
      <span v-if="t.error" class="err" :title="t.error">!</span>
    </div>
  </div>
</template>

<style scoped>
.queue {
  margin-top: 12px;
  border: 1px solid var(--line);
  background: var(--panel);
}

.qhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  border-bottom: 1px solid var(--line);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--dim);
}

.qrow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 68px 168px 44px 52px 14px;
  gap: 10px;
  align-items: center;
  padding: 6px 12px;
  font-size: 11.5px;
  border-bottom: 1px solid #121618;
  animation: rise 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.qrow:last-child {
  border-bottom: 0;
}

.nm {
  color: var(--dim-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sz {
  color: var(--dim-3);
  font-size: 10.5px;
  text-align: right;
}
.blocks {
  color: var(--acc-mid);
  letter-spacing: -1px;
  font-size: 12px;
  white-space: nowrap;
}
.pct {
  color: var(--fg);
  font-size: 10.5px;
  text-align: right;
  white-space: pre;
}
.st {
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-align: right;
  color: var(--dim);
}

/* 完成态整行转绿；失败态转红。颜色只在终态出现，传输中保持中性。 */
.qrow.done .blocks,
.qrow.duplicate .blocks {
  color: var(--acc);
}
.qrow.done .st,
.qrow.duplicate .st {
  color: var(--acc);
}
.qrow.duplicate .st {
  color: var(--warn);
}
.qrow.error .blocks {
  color: var(--err);
}
.qrow.error .st,
.qrow.error .err {
  color: var(--err);
}

.err {
  font-weight: 700;
  cursor: help;
}

@media (max-width: 900px) {
  .qrow {
    grid-template-columns: minmax(0, 1fr) 148px 44px;
  }
  .sz,
  .st,
  .err {
    display: none;
  }
}
</style>
