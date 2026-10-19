<script setup lang="ts">
/**
 * 右侧详情面板：预览 + 元数据 + 分享链接。
 *
 * 分享链接的四种格式全部在本地拼装，只依赖后端返回的那一个 `url`——
 * 域名一旦变更只改后端配置，前端无需跟着动。
 */
import { computed, nextTick, ref, watch } from 'vue'

import { galleryState } from '@/stores/gallery'
import type { ImageItem } from '@/types'
import { formatBytes, formatTime, thumbUrl } from '@/utils/format'

const props = defineProps<{ image: ImageItem | null }>()
const emit = defineEmits<{
  delete: [string]
  /** 把图片移动到指定目录；folderId 为空串表示根目录 */
  move: [string, string]
  /** 改展示名。只影响显示，key 与 URL 不变，已分享的链接不受影响 */
  rename: [string, string]
}>()

/** 「移动到…」面板是否展开 */
const moving = ref(false)

/* ---------- 文件名就地编辑 ---------- */

const editingName = ref(false)
const nameDraft = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

function startRename() {
  if (!props.image || editingName.value) return
  nameDraft.value = props.image.filename
  editingName.value = true
  // 等输入框挂载后再聚焦，并全选方便直接覆盖输入
  nextTick(() => {
    nameInput.value?.focus()
    nameInput.value?.select()
  })
}

/** 提交改名。空串或与原名相同视为取消——省一次注定无变化的请求。 */
function commitRename() {
  if (!editingName.value) return // Enter 提交后输入框卸载会再触发一次 blur
  editingName.value = false
  if (!props.image) return
  const name = nameDraft.value.trim()
  if (!name || name === props.image.filename) return
  emit('rename', props.image.id, name)
}

function cancelRename() {
  editingName.value = false
}

/**
 * 可选的目录列表。
 *
 * 后端按 path 升序返回，这个顺序本身就是深度优先的，所以平铺渲染再按 depth
 * 缩进，就能得到与左侧目录树一致的视觉层级——不必在这里再建一次树。
 */
const folderOptions = computed(() =>
  galleryState.folders.map((f) => ({ id: f.id, name: f.name, depth: f.depth })),
)

function doMove(folderId: string) {
  const im = props.image
  moving.value = false
  // 目标就是当前所在目录时不发请求：后端虽会当成空操作返回，
  // 但没必要为一次「什么都没发生」的点击打一个来回
  if (!im || im.folder_id === folderId) return
  emit('move', im.id, folderId)
}

type Fmt = 'url' | 'md' | 'html' | 'bb'

const FORMATS: { key: Fmt; label: string }[] = [
  { key: 'url', label: 'URL' },
  { key: 'md', label: 'Markdown' },
  { key: 'html', label: 'HTML' },
  { key: 'bb', label: 'BBCode' },
]

const fmt = ref<Fmt>('url')
const copied = ref(false)
let copyTimer: number | undefined

/** 切换图片时把格式、复制态与移动面板一起复位，避免把上一张的状态带过来 */
watch(
  () => props.image?.id,
  () => {
    copied.value = false
    moving.value = false
  },
)

const link = computed(() => {
  const im = props.image
  if (!im) return ''
  switch (fmt.value) {
    case 'url':
      return im.url
    case 'md':
      return `![${im.filename}](${im.url})`
    case 'html':
      return `<img src="${im.url}" alt="${im.filename}" loading="lazy">`
    case 'bb':
      return `[img]${im.url}[/img]`
  }
})

const sizeText = computed(() => {
  const im = props.image
  if (!im) return ''
  const dim = im.width && im.height ? `${im.width} × ${im.height}` : '尺寸未知'
  return `${dim} · ${formatBytes(im.size)}`
})

async function copy() {
  const text = link.value
  if (!text) return

  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 非 secure context 或权限被拒时退回旧接口
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
    } catch {
      /* 两条路都失败就只能作罢 */
    }
    ta.remove()
  }

  copied.value = true
  window.clearTimeout(copyTimer)
  copyTimer = window.setTimeout(() => {
    copied.value = false
  }, 1600)
}
</script>

<template>
  <div class="insp">
    <div class="head">
      <span>inspector</span>
      <span class="id">{{ image ? image.id.slice(-8) : '——' }}</span>
    </div>

    <template v-if="image">
      <figure class="preview">
        <!-- 面板宽度约 300px，取 640 是为了覆盖 2x 屏；下方"打开原图"仍走原图地址 -->
        <img :src="thumbUrl(image.url, 640)" :alt="image.filename" decoding="async" />
        <figcaption>{{ sizeText }}</figcaption>
      </figure>

      <div class="kv">
        <div class="r">
          <span>文件名</span>
          <!-- 点击就地编辑：Enter/失焦提交，Esc 取消。改名只动展示名，不影响链接 -->
          <input
            v-if="editingName"
            ref="nameInput"
            v-model="nameDraft"
            class="v name-edit"
            maxlength="255"
            spellcheck="false"
            @keyup.enter="commitRename"
            @keyup.esc="cancelRename"
            @blur="commitRename"
          />
          <span v-else class="v name" :title="image.filename" @click="startRename">{{ image.filename }}</span>
        </div>
        <div class="r"><span>格式</span><span class="v">{{ image.ext.replace('.', '').toUpperCase() }} · {{ image.mime }}</span></div>
        <div class="r"><span>大小</span><span class="v">{{ formatBytes(image.size) }}</span></div>
        <div class="r"><span>分辨率</span><span class="v">{{ image.width && image.height ? `${image.width} × ${image.height}` : '未解析' }}</span></div>
        <div class="r"><span>可见性</span><span class="v">{{ image.visibility === 'public' ? '公开' : '私有' }}</span></div>
        <div class="r"><span>上传时间</span><span class="v">{{ formatTime(image.created_at) }}</span></div>
      </div>

      <div class="tabs">
        <button
          v-for="f in FORMATS"
          :key="f.key"
          :class="{ on: fmt === f.key }"
          @click="fmt = f.key"
        >
          {{ f.label }}
        </button>
      </div>

      <div class="share">
        <div class="urlbox">{{ link }}</div>
        <button class="copy" :class="{ done: copied }" @click="copy">
          {{ copied ? '✓ 已复制' : 'copy / 复制' }}
        </button>
      </div>

      <!-- 移动入口单独占一行：和「打开原图/删除」挤在同一行会把按钮文字压到换行 -->
      <button class="act wide" type="button" @click="moving = !moving">
        {{ moving ? '收起目录列表' : '移动到…' }}
      </button>

      <div v-if="moving" class="move">
        <button
          class="mrow"
          :class="{ cur: image.folder_id === '' }"
          type="button"
          @click="doMove('')"
        >
          / root
        </button>
        <button
          v-for="f in folderOptions"
          :key="f.id"
          class="mrow"
          :class="{ cur: f.id === image.folder_id }"
          :style="{ paddingLeft: `${10 + (f.depth - 1) * 12}px` }"
          type="button"
          @click="doMove(f.id)"
        >
          {{ f.name }}
        </button>
        <p v-if="folderOptions.length === 0" class="mhint">// 还没有目录，先在左侧新建</p>
      </div>

      <div class="acts">
        <a class="act" :href="image.url" target="_blank" rel="noopener noreferrer">打开原图</a>
        <button class="act danger" @click="emit('delete', image.id)">删除</button>
      </div>
    </template>

    <p v-else class="none">// 选中一张图片查看详情</p>
  </div>
</template>

<style scoped>
.insp {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  border-left: 1px solid var(--line);
  background: #0a0c0d;
}

.head {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  font-size: 10px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--dim-3);
  flex: none;
}
.head .id {
  color: var(--dim);
}

.preview {
  position: relative;
  margin: 14px 16px;
  border: 1px solid var(--line-2);
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  max-height: 240px;
  overflow: hidden;
}
.preview img {
  display: block;
  max-width: 100%;
  max-height: 240px;
  object-fit: contain;
}
.preview figcaption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 6px 9px;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: #9fb0ad;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.85), transparent);
}

.kv {
  padding: 0 16px 12px;
  font-size: 11.5px;
}
.kv .r {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px dotted #1a2023;
}
.kv .r > span:first-child {
  color: var(--dim-3);
  flex: none;
}
.kv .v {
  color: var(--dim-2);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 文件名可点击改名。悬停用虚线下划线提示可编辑，不抢其它行的注意力 */
.kv .name {
  cursor: text;
}
.kv .name:hover {
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  color: var(--fg);
}
.kv .name-edit {
  flex: 1;
  min-width: 0;
  background: var(--panel-2);
  border: 1px solid var(--acc-mid);
  color: var(--fg);
  font: inherit;
  text-align: right;
  padding: 2px 6px;
  outline: none;
}

.tabs {
  display: flex;
  gap: 1px;
  padding: 0 16px;
  flex-wrap: wrap;
}
.tabs button {
  background: var(--panel);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 4px 9px;
  cursor: pointer;
  transition: 0.15s;
}
.tabs button:hover {
  color: var(--fg);
}
.tabs button.on {
  background: #0f1a15;
  border-color: var(--acc-dim);
  color: var(--acc);
}

.share {
  padding: 10px 16px 14px;
}
.urlbox {
  background: #000;
  border: 1px solid var(--line-2);
  padding: 9px 10px;
  font-size: 11px;
  color: var(--acc);
  word-break: break-all;
  line-height: 1.6;
  min-height: 58px;
  max-height: 120px;
  overflow-y: auto;
}
.copy {
  margin-top: 8px;
  width: 100%;
  background: var(--acc);
  color: #04140c;
  border: 0;
  padding: 9px;
  cursor: pointer;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  transition: 0.15s;
}
.copy:hover {
  background: #5cffb4;
}
.copy.done {
  background: #0f1a15;
  color: var(--acc);
  box-shadow: inset 0 0 0 1px var(--acc-dim);
}

/*
 * 移动入口：整行宽，独立于下面那个两列网格。
 *
 * `flex: none` 是必须的，不是保险：`.insp` 是 flex 纵向容器，子项默认
 * flex-shrink: 1，内容变高时会被压扁（实测面板被压到 85px 而内容需要 138px）。
 * 组件里原有的 .head 也是靠同一个属性防住的。
 */
.act.wide {
  display: block;
  flex: none;
  width: calc(100% - 32px);
  margin: 0 16px 1px;
}

.move {
  flex: none;
  margin: 0 16px 8px;
  border: 1px solid var(--line-2);
  background: #000;
  max-height: 190px;
  overflow-y: auto;
}
.mrow {
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
.mrow:last-child {
  border-bottom: 0;
}
.mrow:hover {
  background: #141819;
  color: var(--fg);
}
/* 当前所在目录：标出来并且不响应点击，避免「点了没反应」 */
.mrow.cur {
  color: var(--acc);
  cursor: default;
}
.mrow.cur:hover {
  background: #0f1a15;
}
.mhint {
  padding: 8px 10px;
  font-size: 11px;
  color: var(--dim-3);
}

.acts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  margin: 0 16px 20px;
}
.act {
  display: block;
  text-align: center;
  text-decoration: none;
  background: var(--panel);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 8px 4px;
  cursor: pointer;
  transition: 0.15s;
}
.act:hover {
  color: var(--fg);
  background: #141819;
  border-color: var(--line-2);
}
.act.danger:hover {
  color: var(--err);
  border-color: #40201e;
  background: #1a0f0e;
}

.none {
  padding: 40px 16px;
  text-align: center;
  font-size: 11.5px;
  color: var(--dim-3);
}
</style>
