<script setup lang="ts">
/**
 * 图库表格。
 *
 * 缩略图走 Cloudflare Image Transformations（`thumbUrl()`），不需要自己存缩略图、
 * 也不需要任何后端参与：401 KB 的原图在表格里只拉 1.7 KB 的 96px 版本。
 * 免费额度用尽时 `onerror=redirect` 会自动回退到原图，不会碎图。
 *
 * 注意缩略图**只用于展示**——分享链接一律用 `im.url` 原图地址。
 */
import { computed } from 'vue'

import type { ImageItem } from '@/types'
import { formatBytes, formatTime, thumbUrl } from '@/utils/format'

const props = defineProps<{
  items: ImageItem[]
  selectedId: string | null
  /** 批量勾选的图片集合，来自 gallery store */
  selectedIds: Set<string>
  loading: boolean
  /** 后端总数，可能大于当前渲染条数 */
  total: number
}>()

const emit = defineEmits<{
  select: [string]
  /** 勾选/取消勾选一张 */
  toggle: [string]
  /** 表头的全选/全不选 */
  toggleAll: [boolean]
}>()

/**
 * 表头复选框的状态：三态里的两态（全选/全不选）。
 * 半选态（indeterminate）需要直接操作 DOM 的 checked 属性，这里刻意不做——
 * 个人量级下「看一眼有没有全选」够用了，不值得为它加一段 DOM 操作。
 */
const allChecked = computed(
  () => props.items.length > 0 && props.items.every((i) => props.selectedIds.has(i.id)),
)
</script>

<template>
  <div class="wrap">
    <table class="files">
      <thead>
        <tr>
          <th class="c-check">
            <input
              type="checkbox"
              class="chk"
              :checked="allChecked"
              title="全选当前可见的图片"
              @change="emit('toggleAll', ($event.target as HTMLInputElement).checked)"
            />
          </th>
          <th class="c-thumb" />
          <th>文件名</th>
          <th class="c-size">大小</th>
          <th class="c-dim">分辨率</th>
          <th class="c-time">上传时间</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="im in items"
          :key="im.id"
          :class="{ sel: im.id === selectedId }"
          tabindex="0"
          @click="emit('select', im.id)"
          @keydown.enter.prevent="emit('select', im.id)"
        >
          <td class="c-check" @click.stop>
            <input
              type="checkbox"
              class="chk"
              :checked="selectedIds.has(im.id)"
              :aria-label="`选择 ${im.filename}`"
              @change="emit('toggle', im.id)"
            />
          </td>
          <td>
            <img
              class="thumb"
              :src="thumbUrl(im.url, 96)"
              :alt="im.filename"
              loading="lazy"
              decoding="async"
            />
          </td>
          <td class="name" :title="im.filename">{{ im.filename }}</td>
          <td class="num">{{ formatBytes(im.size) }}</td>
          <td class="num">{{ im.width }} × {{ im.height }}</td>
          <td class="num">{{ formatTime(im.created_at) }}</td>
        </tr>
      </tbody>
    </table>

    <p v-if="loading && items.length === 0" class="empty">// 正在读取图库…</p>
    <p v-else-if="items.length === 0" class="empty">
      // 这里还是空的 —— 把图片拖到上面的虚线框里，或直接 Ctrl+V 粘贴
    </p>
    <p v-else-if="items.length < total" class="more">
      // 已显示 {{ items.length }} / {{ total }} 张，滚动加载尚未实现（M6）
    </p>
  </div>
</template>

<style scoped>
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
  cursor: pointer;
  transition: background 0.12s;
  outline: none;
}
.files tbody tr:hover {
  background: #0f1416;
}
.files tbody tr:focus-visible {
  background: #0f1416;
  box-shadow: inset 0 0 0 1px var(--acc-dim);
}
.files tbody tr.sel {
  background: #0f1a15;
  box-shadow: inset 2px 0 0 var(--acc);
}
.files tbody tr.sel td {
  color: var(--fg);
}

.thumb {
  width: 34px;
  height: 24px;
  object-fit: cover;
  display: block;
  border: 1px solid var(--line-2);
  background: #000;
}

.c-check {
  width: 34px;
}
.chk {
  display: block;
  margin: 0;
  /* 勾选框的颜色跟主题走：默认的蓝在这个绿色终端里非常突兀 */
  accent-color: var(--acc);
  cursor: pointer;
}

.c-thumb {
  width: 58px;
}
.c-size {
  width: 82px;
}
.c-dim {
  width: 108px;
}
/*
 * 156px 是算出来的，不是拍的：IBM Plex Mono 的字符步进是 0.6em，
 * 11.5px 下每个字符 6.9px，`2026-09-30 11:12` 共 16 字符 = 110.4px，
 * 加上左右各 12px 的内边距需要 134.4px。原来 128px 刚好差 6px，
 * 于是末尾被截成 `2026-09-30 11:`。
 */
.c-time {
  width: 156px;
}

.name {
  color: var(--fg);
}
.num {
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
}

.empty,
.more {
  padding: 34px 12px;
  text-align: center;
  color: var(--dim-3);
  font-size: 12px;
  letter-spacing: 0.02em;
}
.more {
  padding: 14px 12px;
  border-top: 1px solid var(--line);
}
</style>
