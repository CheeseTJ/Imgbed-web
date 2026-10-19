<script setup lang="ts">
/**
 * 拖拽上传区。
 *
 * 支持三种投递方式：拖入、点击选择、粘贴剪贴板。
 * 粘贴这一步很值：截图后直接 Ctrl+V 是最高频的上传姿势，
 * 少一次"先存盘再选文件"的来回。
 */
import { onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits<{ files: [File[]] }>()

const over = ref(false)
const input = ref<HTMLInputElement | null>(null)

/**
 * dragenter/dragleave 会在子元素之间来回触发，
 * 只用一个布尔量的话鼠标一移动到子节点上高亮就会闪。
 * 用进出计数抵消才稳。
 */
let depth = 0

function onDragEnter(e: DragEvent) {
  e.preventDefault()
  depth += 1
  over.value = true
}

function onDragOver(e: DragEvent) {
  // 必须阻止默认行为，否则浏览器不会触发 drop
  e.preventDefault()
}

function onDragLeave(e: DragEvent) {
  e.preventDefault()
  depth -= 1
  if (depth <= 0) {
    depth = 0
    over.value = false
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  depth = 0
  over.value = false
  const files = e.dataTransfer?.files
  if (files && files.length) emit('files', [...files])
}

function pick() {
  input.value?.click()
}

function onPick(e: Event) {
  const el = e.target as HTMLInputElement
  if (el.files && el.files.length) emit('files', [...el.files])
  // 清空 value，否则连续选同一个文件不会触发 change
  el.value = ''
}

/** 全局粘贴：从剪贴板里挑出图片文件。 */
function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  const files: File[] = []
  for (const item of items) {
    if (item.kind !== 'file') continue
    const f = item.getAsFile()
    if (f) files.push(f)
  }
  if (files.length) emit('files', files)
}

onMounted(() => document.addEventListener('paste', onPaste))
onUnmounted(() => document.removeEventListener('paste', onPaste))
</script>

<template>
  <div
    class="drop"
    :class="{ over }"
    role="button"
    tabindex="0"
    @click="pick"
    @keydown.enter.prevent="pick"
    @keydown.space.prevent="pick"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <span class="corner tl">+</span>
    <span class="corner tr">+</span>
    <span class="corner bl">+</span>
    <span class="corner br">+</span>

    <h3>[ 拖入文件 或 点击选择 ]</h3>
    <p>png · jpg · gif · webp &nbsp;/&nbsp; 以内容判定类型，改扩展名无效</p>
    <div class="hint">TIP — 按 <kbd>Ctrl</kbd>+<kbd>V</kbd> 直接粘贴剪贴板里的图片</div>

    <input ref="input" type="file" accept="image/*" multiple hidden @change="onPick" />
  </div>
</template>

<style scoped>
.drop {
  position: relative;
  border: 1px dashed var(--line-2);
  background: linear-gradient(180deg, rgba(53, 255, 158, 0.02), transparent);
  padding: 30px 26px;
  text-align: center;
  cursor: pointer;
  outline: none;
  transition:
    border-color 0.2s,
    background 0.2s;
}
.drop:hover,
.drop:focus-visible {
  border-color: var(--acc-dim);
  background: rgba(53, 255, 158, 0.035);
}
.drop.over {
  border-color: var(--acc);
  border-style: solid;
  background: rgba(53, 255, 158, 0.07);
}

.corner {
  position: absolute;
  color: var(--acc-mid);
  font-size: 12px;
  line-height: 1;
  pointer-events: none;
}
.corner.tl {
  top: -7px;
  left: -5px;
}
.corner.tr {
  top: -7px;
  right: -5px;
}
.corner.bl {
  bottom: -7px;
  left: -5px;
}
.corner.br {
  bottom: -7px;
  right: -5px;
}
.drop.over .corner {
  color: var(--acc);
}

.drop h3 {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.22em;
  color: var(--fg);
  margin-bottom: 9px;
}
.drop p {
  font-size: 11.5px;
  color: var(--dim);
  letter-spacing: 0.03em;
}
.drop .hint {
  margin-top: 13px;
  font-size: 10.5px;
  color: var(--dim-3);
}
.drop kbd {
  border: 1px solid var(--line-2);
  padding: 0 5px;
  color: var(--dim-2);
  font-size: 10.5px;
}
</style>
