<script setup lang="ts">
/**
 * 应用外壳：窗口 chrome + 左侧导航 + 底部状态栏。
 *
 * 导航只放真实存在的入口：设置在 M6 落地前**整个不显示**——
 * 灰置的假入口会诱导点击，然后只换来一句「尚未实现」，比没有更糟。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { authState } from '@/stores/auth'
import { formatBytesSI } from '@/utils/format'

/** 侧栏用它判断当前处于哪个视图，从而点亮对应的导航项 */
const route = useRoute()

defineProps<{
  /** 面包屑 / 当前路径，显示在标题栏与 prompt 行 */
  path?: string
}>()

/**
 * 存储占用：优先用 Cloudflare 报告的真实占用（对象本体 + 元数据，**含回收站**），
 * 没配 token 或上游出错时回退到数据库口径。
 *
 * 两者的差别不只是口径：前者**含回收站里的图**——
 * 用户删掉一张图后配额不会立刻回退，那是正常的，不是 bug。
 */
const storage = computed(() => {
  const u = authState.usage
  if (u?.r2) return { used: u.r2.used_bytes, quota: u.r2.quota_bytes }
  return { used: u?.used_bytes ?? 0, quota: 0 }
})

const usedText = computed(() => {
  const s = storage.value
  return s.quota > 0
    ? `${formatBytesSI(s.used)} / ${formatBytesSI(s.quota)}`
    : formatBytesSI(s.used)
})

const quotaPct = computed(() => {
  const s = storage.value
  if (s.quota <= 0) return 0
  return Math.min(100, Math.round((s.used / s.quota) * 100))
})

/**
 * 账户级用量（全部桶），hover 存储区时浮出。
 *
 * 存储条只统计图床自己的桶；music、db-backup 这些同账户的桶只在这里可见，
 * 用来对上 dashboard 的账户级数字。null（没配 token / 上游出错）时整个面板隐藏，
 * 存储条不受影响。
 */
const acct = computed(() => authState.usage?.r2_account ?? null)
</script>

<template>
  <div class="app">
    <div class="term">
      <!-- 标题栏 -->
      <div class="term__bar">
        <div class="lights"><i /><i /><i /></div>
        <span class="path">uplink@edge-01: ~/{{ path || '' }}</span>
        <!--
          右侧原先是「v0.1.0 · imgbed.june-t.top」：版本号纯属装饰，域名浏览器标签上
          本来就有，都属于可以安静消失的信息。这里改成账户芯片——呼吸点 + 邮箱，
          顺带把原先状态栏 CONNECTED 的连接指示合并进来（那个绿点本来就在别处呼吸着）。
        -->
        <span class="tail"><i class="pulse" />{{ authState.user?.email ?? '未登录' }}</span>
      </div>

      <div class="body">
        <!-- 左侧导航 -->
        <nav class="rail">
          <div class="grp">workspace</div>
          <router-link to="/" class="nav" :class="{ on: route.name === 'library' }">
            <span class="k">[▦]</span><span class="lbl">图库</span>
          </router-link>
          <router-link to="/trash" class="nav" :class="{ on: route.name === 'trash' }">
            <span class="k">[⌫]</span><span class="lbl">回收站</span>
          </router-link>

          <!-- 目录树由页面注入：外壳只负责给它一个位置，
               不关心它有几级、怎么展开——那是图库页的事 -->
          <slot name="tree" />

          <div class="spacer" />

          <div class="quota">
            <div class="q-hd">
              STORAGE
              <span v-if="acct" class="q-caret">▾</span>
            </div>
            <div class="bar"><i :style="{ width: quotaPct + '%' }" /></div>
            <div class="row">
              <span>{{ usedText }}</span>
              <span class="pct">{{ quotaPct }}%</span>
            </div>

            <!--
              hover 展开的账户全量面板。存储条只统计图床自己的桶（单桶口径），
              这里列出账户下所有桶，让 dashboard 上那个账户级数字有处可对。
              面板是 .quota 的子元素，指针从条移入面板不会丢失 :hover。
            -->
            <div v-if="acct" class="acct" role="tooltip">
              <div v-for="b in acct.buckets" :key="b.name" class="a-row">
                <span class="a-name" :title="b.name">{{ b.current ? '▸ ' : '' }}{{ b.name }}</span>
                <span class="a-cnt">×{{ b.object_count }}</span>
                <span class="a-size">{{ formatBytesSI(b.used_bytes) }}</span>
              </div>
              <div class="a-row a-total">
                <span class="a-name">合计</span>
                <span class="a-cnt">×{{ acct.total_object_count }}</span>
                <span class="a-size">{{ formatBytesSI(acct.total_used_bytes) }}</span>
              </div>
              <div class="a-note">▸ = 存储条统计的桶</div>
            </div>
          </div>
        </nav>

        <!-- 主区 -->
        <main>
          <slot />
        </main>

        <!-- 右侧详情栏：选中某张图后由 Inspector 填充。
             外层包一个 aside 是为了让外壳能按屏宽整体控制它的显隐，
             而不必去改 Inspector 自身的样式。 -->
        <aside class="insp-slot">
          <slot name="inspector" />
        </aside>
      </div>

      <!-- 状态栏：CONNECTED 已并入标题栏右侧的账户芯片，不再重复 -->
      <div class="term__status">
        <span>images <b>{{ authState.usage?.image_count ?? 0 }}</b></span>
        <span>folders <b>{{ authState.usage?.folder_count ?? 0 }}</b></span>
        <span class="spacer" />
        <span><b>UTF-8</b></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  padding: 10px;
}

.term {
  height: 100%;
}

.body {
  display: grid;
  /* 侧栏 | 主区 | 详情栏。详情栏固定宽，主区吃掉剩余空间并自行滚动。 */
  grid-template-columns: 190px minmax(0, 1fr) 330px;
  min-height: 0;
  flex: 1;
}

/* ---------- 侧栏 ---------- */
.rail {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
  background: #0a0c0d;
  padding: 14px 0;
  min-height: 0;
  overflow-y: auto;
}

.grp {
  font-size: 9.5px;
  letter-spacing: 0.24em;
  color: var(--dim-3);
  padding: 0 16px;
  margin: 14px 0 8px;
  text-transform: uppercase;
}
.grp:first-child {
  margin-top: 0;
}

.nav {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 16px;
  color: var(--dim-2);
  font-size: 12.5px;
  border-left: 2px solid transparent;
  /* router-link 渲染成 <a>，浏览器默认的下划线在这里是噪音 */
  text-decoration: none;
}
.nav.on {
  background: #0f1a15;
  color: var(--acc);
  border-left-color: var(--acc);
}
.nav.off {
  color: var(--dim-3);
  cursor: not-allowed;
}
.nav .k {
  color: var(--dim-3);
}
.nav.on .k {
  color: var(--acc-mid);
}

.spacer {
  flex: 1;
}

.quota {
  position: relative; /* 账户面板的定位锚点 */
  padding: 12px 16px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--dim);
  letter-spacing: 0.06em;
}
.q-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.q-caret {
  font-size: 9px;
  color: var(--dim-3);
  transition: transform 0.15s;
}
.quota:hover .q-caret {
  transform: rotate(180deg);
}
.bar {
  height: 5px;
  background: #161c1f;
  margin: 7px 0 6px;
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--acc-dim), var(--acc));
  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.quota .row {
  display: flex;
  justify-content: space-between;
}
.quota .pct {
  color: var(--dim-3);
}

/*
 * 账户全量面板：hover 存储区时向上浮出。
 *
 * 贴着 bottom: 100% 而不是留缝——留一道缝的话，指针穿过缝的瞬间
 * :hover 会短暂丢失，面板还没碰到就消失了。
 * 宽度也刻意不超出侧栏：.rail 是 overflow-y: auto 的滚动容器，
 * 水平溢出会被裁掉或者触发横向滚动条。
 */
.acct {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  z-index: 30;
  background: var(--panel);
  border: 1px solid var(--line-2);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.55);
  padding: 9px 12px;
  letter-spacing: 0.04em;
  opacity: 0;
  visibility: hidden;
  transform: translateY(3px);
  transition: opacity 0.12s, transform 0.12s, visibility 0.12s;
}
.quota:hover .acct {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
.a-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 10px;
  line-height: 1.9;
  color: var(--dim-2);
}
.a-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dim);
}
.a-cnt {
  color: var(--dim-3);
  font-size: 9px;
}
.a-size {
  color: var(--dim-2);
}
.a-total {
  margin-top: 3px;
  padding-top: 5px;
  border-top: 1px solid var(--line);
  color: var(--fg);
}
.a-total .a-name,
.a-total .a-size {
  color: var(--fg);
}
.a-note {
  margin-top: 6px;
  font-size: 9px;
  color: var(--dim-3);
  letter-spacing: 0.02em;
}

/* ---------- 主区 ---------- */
main {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 22px 40px;
}

/* ---------- 标题栏细节 ---------- */
.term__bar .tail {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  /* 从 --dim-3 提到 --dim-2：这里现在是账户身份（功能性信息），不是角落装饰 */
  color: var(--dim-2);
  font-size: 10.5px;
}

/* ---------- 详情栏容器 ---------- */
.insp-slot {
  display: flex;
  min-width: 0;
  min-height: 0;
}
.insp-slot > * {
  flex: 1;
  min-width: 0;
}

/* ---------- 窄屏 ---------- */
@media (max-width: 1280px) {
  /* 空间不够时优先保图库本身：详情栏整体隐藏，
     而不是让它占着三成宽度把表格压到不可读 */
  .body {
    grid-template-columns: 190px minmax(0, 1fr);
  }
  .insp-slot {
    display: none;
  }
}

@media (max-width: 1080px) {
  .body {
    grid-template-columns: 56px minmax(0, 1fr);
  }
  .rail .lbl,
  .rail .grp,
  .rail .who,
  .rail .uid {
    display: none;
  }
  .nav {
    justify-content: center;
    padding: 9px 0;
  }
  .quota {
    display: none;
  }
}
</style>
