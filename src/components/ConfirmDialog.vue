<script setup lang="ts">
/**
 * 终端风格确认弹窗，用来替代 window.confirm。
 *
 * 原生弹窗的问题不只是难看：它的字体、圆角、系统配色全都来自操作系统，
 * 跟这个终端界面没有任何共同语言；而且按钮文案固定为「确定 / 取消」，
 * 破坏性操作也无法给出红色警示。
 *
 * 这里刻意复用应用已有的设计语言：
 *   - 直角边框 + 1px 描边（全站没有任何圆角）
 *   - 顶栏用和图库分区头一致的「小字号 + 大写 + 宽字距」写法
 *   - 正文加一行 `uplink@edge-01:~$ ...` 命令行，呼应图库页顶部那行提示符
 *   - 危险操作用 --err 红替代 --acc 绿
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** 顶栏标题 */
    title?: string
    /** 终端命令行，显示在正文上方；留空则不显示 */
    command?: string
    /** 主文案 */
    message: string
    /** 次要说明，弱化显示 */
    detail?: string
    confirmLabel?: string
    cancelLabel?: string
    /** 危险操作：确认按钮与顶栏标记改用红色 */
    danger?: boolean
  }>(),
  {
    title: '确认操作',
    command: '',
    detail: '',
    confirmLabel: '确定',
    cancelLabel: '取消',
    danger: false,
  },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const cancelBtn = ref<HTMLButtonElement | null>(null)

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.preventDefault()
  emit('cancel')
}

/**
 * 打开时把焦点放到「取消」而不是「确认」上。
 *
 * 这样键盘用户直接回车不会误删；确认按钮仍然可以通过 Tab 或点击到达。
 */
watch(
  () => props.open,
  async (open) => {
    if (!open) {
      window.removeEventListener('keydown', onKeydown)
      return
    }
    window.addEventListener('keydown', onKeydown)
    await nextTick()
    cancelBtn.value?.focus()
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="dlg">
      <div v-if="open" class="backdrop" @click.self="emit('cancel')">
        <div class="dlg" :class="{ danger }" role="dialog" aria-modal="true" :aria-label="title">
          <div class="hd">
            <span class="mark" />
            <span>{{ title }}</span>
          </div>

          <div class="bd">
            <p v-if="command" class="cmd">
              <span class="p1">uplink</span><span class="p2">@</span><span class="p1">edge-01</span
              ><span class="p2">:~$</span><span class="code">{{ command }}</span>
            </p>
            <p class="msg">{{ message }}</p>
            <p v-if="detail" class="det">{{ detail }}</p>
          </div>

          <div class="ft">
            <button ref="cancelBtn" class="dlg-btn" type="button" @click="emit('cancel')">
              {{ cancelLabel }}
            </button>
            <button class="dlg-btn dlg-btn--go" type="button" @click="emit('confirm')">
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  /* 高于 toast 的 9500，也高于 CRT 叠加层的 9000 */
  z-index: 9600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(4, 6, 6, 0.74);
  backdrop-filter: blur(2px);
}

.dlg {
  width: min(430px, 100%);
  background: var(--panel);
  border: 1px solid var(--line-2);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.7);
}

.hd {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 16px;
  border-bottom: 1px solid var(--line);
  font-size: 10px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  /* 比分区头亮一档：弹窗的标题是主要标签，不该像装饰性文字那样退到背景里 */
  color: var(--dim);
}
.hd .mark {
  width: 6px;
  height: 6px;
  flex: none;
  background: var(--acc);
}
.dlg.danger .hd .mark {
  background: var(--err);
}

.bd {
  padding: 15px 16px 17px;
}

.cmd {
  font-size: 11.5px;
  margin-bottom: 11px;
  word-break: break-all;
  line-height: 1.5;
}
.cmd .p1 {
  color: var(--acc);
}
.cmd .p2 {
  color: var(--dim);
}
.cmd .code {
  color: var(--fg);
  margin-left: 6px;
}

.msg {
  font-size: 12.5px;
  color: var(--fg);
  line-height: 1.65;
  word-break: break-all;
}
.det {
  margin-top: 9px;
  font-size: 11.5px;
  color: var(--dim-2);
  line-height: 1.7;
}

.ft {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  padding: 0 16px 16px;
}
/*
 * ⚠️ 这里叫 dlg-btn 而不是 btn，是为了避开 main.css 里的全局 `.btn`（登录页的实心绿按钮）。
 *
 * 之前叫 .btn 时踩过一次坑：本组件是「作用域样式」，规则会编译成 `.btn:hover[data-v-x]`，
 * 特异性 (0,3,0)；而全局那条 `.btn:hover:not(:disabled)` 也是 (0,3,0)，两者打平。
 * 打平后按源序决定胜负，而本组件的 hover 规则没有声明 background，
 * 于是全局的 `background: #5cffb4` 漏了进来 —— 取消按钮一悬停就变成整块亮绿。
 *
 * 教训：往全局样式已经占用的类名上叠加作用域样式并不安全，命名空间更稳妥。
 */
.dlg-btn {
  background: var(--panel-2);
  border: 1px solid var(--line);
  color: var(--dim-2);
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 9px;
  cursor: pointer;
  transition: 0.15s;
}
.dlg-btn:hover {
  color: var(--fg);
  border-color: var(--line-2);
}
.dlg-btn:focus-visible {
  outline: none;
  border-color: var(--acc-mid);
  color: var(--fg);
}

.dlg-btn--go {
  background: var(--acc);
  border-color: var(--acc);
  color: #04140c;
  font-weight: 600;
}
.dlg-btn--go:hover {
  background: #5cffb4;
  border-color: #5cffb4;
  color: #04140c;
}
.dlg-btn--go:focus-visible {
  border-color: #9fffd0;
  color: #04140c;
}

/*
 * 危险态刻意不做满色填充。
 *
 * 全站只有「copy / 复制」那一处用了实心大色块，而且 --err 一直是小面积文字色；
 * #ff5f57 满铺会盖过整个弹窗。改成「暗红底 + 红字」，悬停时才填满——
 * 这也顺带符合「不要给破坏性操作最高视觉权重」的惯例，默认焦点也放在取消上。
 */
.dlg.danger .dlg-btn--go {
  background: #1a0f0e;
  border-color: #7a3a36;
  color: var(--err);
}
.dlg.danger .dlg-btn--go:hover {
  background: var(--err);
  border-color: var(--err);
  color: #1a0a09;
}
.dlg.danger .dlg-btn--go:focus-visible {
  border-color: var(--err);
  color: var(--err);
}
.dlg.danger .dlg-btn:focus-visible {
  border-color: #7a3a36;
}

.dlg-enter-active,
.dlg-leave-active {
  transition: opacity 0.16s ease;
}
.dlg-enter-active .dlg,
.dlg-leave-active .dlg {
  transition: transform 0.16s ease;
}
.dlg-enter-from,
.dlg-leave-to {
  opacity: 0;
}
.dlg-enter-from .dlg,
.dlg-leave-to .dlg {
  transform: translateY(6px);
}
</style>
