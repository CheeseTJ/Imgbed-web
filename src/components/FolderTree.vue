<script setup lang="ts">
/**
 * 侧栏里的目录树。
 *
 * 树是从 gallery store 的平铺列表在前端组装的——后端一次返回全部目录，
 * 前端按 parent_id 归类即可。这样切目录、展开折叠都是纯本地操作。
 *
 * 新建目录用**行内输入**而不是再弹一个对话框：终端界面里多一层模态是负担，
 * 而且这个操作只需要一个字符串，就地输入、回车确认、Esc 取消最直接。
 *
 * 默认全部展开：个人图床的目录通常只有几十个，折叠起来反而让人找不到东西。
 * 因此内部记的是「被折叠的集合」，不在集合里就是展开。
 */
import { computed, nextTick, ref } from 'vue'

import { galleryState } from '@/stores/gallery'
import type { FolderItem } from '@/types'

const emit = defineEmits<{
  /** 进入某个目录；传空串表示回根目录 */
  open: [string]
  create: [string]
  remove: [string]
  /** 改名，参数是 (id, 新名字) */
  rename: [string, string]
}>()

/** 被折叠的目录 id。不在集合里 = 展开。 */
const collapsed = ref(new Set<string>())

const creating = ref(false)
const draft = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

/** 正在改名的那一行的 id；null 表示没有行在编辑 */
const editingId = ref<string | null>(null)
const renameDraft = ref('')
const renameEl = ref<HTMLInputElement | null>(null)

async function startRename(row: { id: string; name: string }) {
  editingId.value = row.id
  renameDraft.value = row.name
  await nextTick()
  renameEl.value?.focus()
  renameEl.value?.select()
}

/**
 * 函数式 ref。改名输入框在 v-for 里，普通 ref 会收集成数组；
 * 而同一时刻只有一行在编辑，用函数引用拿到的就是那个唯一的元素。
 */
function setRenameEl(el: unknown) {
  renameEl.value = (el as HTMLInputElement | null) ?? null
}

function cancelRename() {
  editingId.value = null
  renameDraft.value = ''
}

function commitRename() {
  const id = editingId.value
  const name = renameDraft.value.trim()
  cancelRename()
  // 名字没变就不发请求：blur 触发的提交不该产生一次空操作的网络往返
  if (!id || !name) return
  const original = galleryState.folders.find((f) => f.id === id)
  if (original && original.name === name) return
  emit('rename', id, name)
}

interface TreeRow {
  id: string
  name: string
  /** 缩进层级，从 1 开始（0 是根目录那一行） */
  depth: number
  hasChildren: boolean
  expanded: boolean
}

/** 把平铺列表按展开状态压成一行行，避免递归组件。 */
const rows = computed<TreeRow[]>(() => {
  const byParent = new Map<string, FolderItem[]>()
  for (const f of galleryState.folders) {
    const list = byParent.get(f.parent_id)
    if (list) list.push(f)
    else byParent.set(f.parent_id, [f])
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }

  const out: TreeRow[] = []
  const walk = (parentId: string, depth: number) => {
    for (const f of byParent.get(parentId) ?? []) {
      const hasChildren = (byParent.get(f.id) ?? []).length > 0
      const expanded = !collapsed.value.has(f.id)
      out.push({ id: f.id, name: f.name, depth, hasChildren, expanded })
      if (hasChildren && expanded) walk(f.id, depth + 1)
    }
  }
  walk('', 1)
  return out
})

/** 当前所在目录名，用于给「新建」按钮一个明确的落点提示。 */
const currentName = computed(() => {
  if (galleryState.currentFolderId === '') return 'root'
  return galleryState.folders.find((f) => f.id === galleryState.currentFolderId)?.name ?? 'root'
})

function toggle(id: string) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

async function startCreate() {
  creating.value = true
  draft.value = ''
  await nextTick()
  inputEl.value?.focus()
}

function cancelCreate() {
  creating.value = false
  draft.value = ''
}

function commitCreate() {
  const name = draft.value.trim()
  if (!name) {
    cancelCreate()
    return
  }
  emit('create', name)
  cancelCreate()
}

/** 缩进量。每级 12px，够看出层级又不至于把名字挤出屏幕。 */
function indent(depth: number): string {
  return `${depth * 12}px`
}
</script>

<template>
  <div class="tree">
    <div class="hd">
      <span>directories</span>
      <button class="add" type="button" title="在当前目录下新建" @click="startCreate">[+]</button>
    </div>

    <div
      class="row"
      :class="{ on: galleryState.currentFolderId === '' }"
      title="根目录"
      @click="emit('open', '')"
    >
      <span class="caret">·</span>
      <span class="nm">root</span>
    </div>

    <div
      v-for="r in rows"
      :key="r.id"
      class="row"
      :class="{ on: galleryState.currentFolderId === r.id }"
      :style="{ paddingLeft: `calc(8px + ${indent(r.depth)})` }"
      :title="r.name"
      @click="editingId === r.id ? undefined : emit('open', r.id)"
    >
      <span
        class="caret"
        :class="{ clickable: r.hasChildren }"
        @click.stop="r.hasChildren && toggle(r.id)"
      >
        {{ r.hasChildren ? (r.expanded ? '▾' : '▸') : '·' }}
      </span>

      <input
        v-if="editingId === r.id"
        :ref="setRenameEl"
        v-model="renameDraft"
        class="inp"
        spellcheck="false"
        @keydown.enter.prevent="commitRename"
        @keydown.esc.prevent="cancelRename"
        @blur="commitRename"
        @click.stop
      />
      <span v-else class="nm">{{ r.name }}</span>

      <template v-if="editingId !== r.id">
        <button
          class="op-btn"
          type="button"
          title="改名"
          @click.stop="startRename(r)"
        >
          ✎
        </button>
        <button
          class="del"
          type="button"
          title="删除目录（需先清空）"
          @click.stop="emit('remove', r.id)"
        >
          ×
        </button>
      </template>
    </div>

    <p v-if="rows.length === 0 && !creating" class="hint">// 还没有目录</p>

    <div v-if="creating" class="mk">
      <span class="pfx">mkdir</span>
      <input
        ref="inputEl"
        v-model="draft"
        class="inp"
        spellcheck="false"
        :placeholder="`在 ${currentName} 下`"
        @keydown.enter.prevent="commitCreate"
        @keydown.esc.prevent="cancelCreate"
        @blur="commitCreate"
      />
    </div>
  </div>
</template>

<style scoped>
.tree {
  margin-top: 18px;
  min-height: 0;
  overflow-y: auto;
}

.hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 6px 16px;
  font-size: 9.5px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--dim-3);
}
.add {
  background: none;
  border: 0;
  padding: 0 2px;
  color: var(--dim-3);
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0;
  cursor: pointer;
  transition: color 0.15s;
}
.add:hover {
  color: var(--acc);
}

.row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px 4px 8px;
  font-size: 11.5px;
  color: var(--dim-2);
  cursor: pointer;
  transition: 0.12s;
}
.row:hover {
  background: #141819;
  color: var(--fg);
}
.row.on {
  background: #0f1a15;
  color: var(--acc);
  box-shadow: inset 2px 0 0 var(--acc);
}

.caret {
  flex: none;
  width: 9px;
  color: var(--dim-3);
  font-size: 9px;
}
.caret.clickable:hover {
  color: var(--acc);
}

.nm {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 删除按钮平时隐形，只在悬停该行时出现——避免这棵小树被一堆 × 填满 */
.del {
  flex: none;
  background: none;
  border: 0;
  padding: 0 2px;
  color: transparent;
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.15s;
}
/* 改名入口与删除同理：平时隐形，悬停该行时浮现 */
.op-btn {
  flex: none;
  background: none;
  border: 0;
  padding: 0 2px;
  color: transparent;
  font-family: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.15s;
}
.row:hover .op-btn {
  color: var(--dim-3);
}
.row .op-btn:hover {
  color: var(--acc);
}
.row:hover .del {
  color: var(--dim-3);
}
.row .del:hover {
  color: var(--err);
}

.hint {
  padding: 6px 16px;
  font-size: 10.5px;
  color: var(--dim-3);
}

.mk {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px 5px 16px;
}
.pfx {
  flex: none;
  font-size: 10px;
  color: var(--acc);
}
.inp {
  flex: 1;
  min-width: 0;
  background: #000;
  border: 1px solid var(--line-2);
  color: var(--fg);
  font-family: var(--mono);
  font-size: 11px;
  padding: 3px 6px;
  outline: none;
}
.inp:focus {
  border-color: var(--acc-mid);
}
.inp::placeholder {
  color: var(--dim-3);
}

/* 窄屏下侧栏只剩图标，目录树整体让位 */
@media (max-width: 1080px) {
  .tree {
    display: none;
  }
}
</style>
