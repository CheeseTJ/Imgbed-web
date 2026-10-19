<script setup lang="ts">
/**
 * 登录页。
 *
 * 直连 Ucenter 的 /v1/auth/login 换取令牌，**不经过本项目的后端**——
 * 密码没有理由在中间再落一手。
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError, APP, BASE } from '@/api/ucenter'
import { authState, login } from '@/stores/auth'

const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')

const emailEl = ref<HTMLInputElement | null>(null)

/**
 * 启动日志：既营造终端氛围，也如实交代「连的是哪个服务、校验哪些东西」。
 *
 * 逐行出现用纯 CSS 的 animation-delay 实现（见模板），**不用 setInterval**：
 * 定时器在后台标签页会被浏览器节流到 1 次/秒，会把开场动画拖成好几秒，
 * 在无头 / 虚拟时间环境下甚至完全不触发。
 */
const BOOT = [
  `connecting ${BASE.replace(/^https?:\/\//, '')} …`,
  `app=${APP} · aud check enabled`,
  'jwks cached · EdDSA / Ed25519',
  'ready — 请验证身份',
]

onMounted(() => emailEl.value?.focus())

/**
 * 把用户中心返回的错误码翻译成人话，避免把原始 code 直接甩给用户。
 * 码值以 Ucenter 实际返回为准（`unknown_app` 是实测确认的）。
 */
const CODE_HINT: Record<string, string> = {
  invalid_credentials: '邮箱或密码不正确',
  unauthorized: '邮箱或密码不正确',
  rate_limited: '尝试过于频繁，请稍后再试',
  unknown_app: '该应用未在用户中心注册 —— 检查 Ucenter 的 APPS 白名单',
  app_not_allowed: '该应用未在用户中心注册 —— 检查 Ucenter 的 APPS 白名单',
  banned: '账号已被禁用',
  no_refresh_token: '登录态已失效，请重新登录',
  session_expired: '登录已过期，请重新登录',
}

async function submit() {
  if (authState.loading) return
  error.value = ''

  if (!email.value.trim() || !password.value) {
    error.value = '邮箱与密码均不能为空'
    return
  }

  try {
    await login(email.value.trim(), password.value)
    const next = typeof route.query.next === 'string' ? route.query.next : '/'
    await router.replace(next)
  } catch (e) {
    if (e instanceof ApiError) {
      const hint = CODE_HINT[e.code]
      error.value = hint ? `${e.code.toUpperCase()} — ${hint}` : `${e.code.toUpperCase()} — ${e.message}`
    } else {
      error.value = e instanceof Error ? e.message : '登录失败，请稍后重试'
    }
    // 清掉密码只保留邮箱：重试时不用重新输邮箱
    password.value = ''
  }
}
</script>

<template>
  <div class="login">
    <div class="term win">
      <!-- 标题栏 -->
      <div class="term__bar">
        <div class="lights"><i /><i /><i /></div>
        <span>uplink://auth</span>
        <span class="tail">imgbed · web</span>
      </div>

      <div class="stage">
        <!-- 字标 -->
        <header class="brand">
          <div class="mark">
            <span class="glyph">▮</span>
            <span class="word">UPLINK</span>
          </div>
          <div class="sub">
            <span>IMAGE&nbsp;HOST</span>
            <span class="tag">私有部署</span>
          </div>
        </header>

        <div class="rule" />

        <!-- 启动日志 -->
        <div class="boot">
          <p
            v-for="(line, i) in BOOT"
            :key="i"
            class="rise"
            :style="{ animationDelay: `${i * 220}ms` }"
          >
            <span class="ok">✓</span><span class="txt">{{ line }}</span>
          </p>
        </div>

        <!-- 命令行。刻意不放装饰性光标：下方输入框里已经有一个真光标了，
             同屏两个光标只会把视线从表单上拽走。 -->
        <div class="prompt">
          <span class="u">uplink</span><span class="s">@</span><span class="u">edge-01</span
          ><span class="s">:~$</span>
          <span class="cmd">login --app {{ APP }}</span>
        </div>

        <!-- 表单 -->
        <form class="form" @submit.prevent="submit">
          <div class="field">
            <span class="cue" aria-hidden="true">&gt;</span>
            <label class="lab" for="email">email</label>
            <input
              id="email"
              ref="emailEl"
              v-model="email"
              type="email"
              autocomplete="username"
              placeholder="you@example.com"
              spellcheck="false"
              :disabled="authState.loading"
            />
          </div>

          <div class="field">
            <span class="cue" aria-hidden="true">&gt;</span>
            <label class="lab" for="password">password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••••"
              :disabled="authState.loading"
            />
          </div>

          <button class="btn" type="submit" :disabled="authState.loading">
            {{ authState.loading ? 'AUTHENTICATING…' : '验证并进入' }}
          </button>
        </form>

        <p v-if="error" class="note note--err rise err">
          <span class="x">✗</span><span>{{ error }}</span>
        </p>

        <p class="hint">
          身份由 <b>Ucenter</b> 统一提供，任意有效账号均可登录<br />
          本页直连用户中心换取令牌，密码不经过图床后端
        </p>
      </div>

      <!-- 状态栏 -->
      <div class="term__status">
        <span><i class="pulse" /> <b>TLS</b></span>
        <span class="spacer" />
        <span>{{ BASE.replace(/^https?:\/\//, '') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login {
  height: 100%;
  display: grid;
  place-items: center;
  padding: 24px;
  overflow-y: auto;
}

.win {
  width: min(560px, 100%);
  animation: rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.stage {
  padding: 26px 30px 30px;
}

/* ---------- 字标 ---------- */
.brand {
  margin-bottom: 18px;
}
.mark {
  display: flex;
  align-items: center;
  gap: 11px;
}
.glyph {
  color: var(--acc);
  font-size: 26px;
  line-height: 1;
  text-shadow: 0 0 14px rgba(53, 255, 158, 0.5);
}
.word {
  font-size: 30px;
  font-weight: 600;
  letter-spacing: 0.28em;
  color: var(--fg);
}
.sub {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0 0 37px;
  font-size: 10.5px;
  letter-spacing: 0.34em;
  color: var(--dim);
}
.tag {
  border: 1px solid var(--line-2);
  padding: 1px 7px;
  font-size: 9.5px;
  letter-spacing: 0.14em;
  color: var(--dim-2);
}

.rule {
  height: 1px;
  background: var(--line);
  margin: 20px 0 16px;
}

/* ---------- 启动日志 ---------- */
.boot {
  min-height: 76px;
  font-size: 11.5px;
  color: var(--dim-2);
  margin-bottom: 14px;
}
.boot p {
  display: flex;
  gap: 9px;
}
.boot .ok {
  color: var(--acc-mid);
}
.boot .txt {
  color: var(--dim-2);
}

/* ---------- 命令行 ---------- */
.prompt {
  font-size: 12.5px;
  margin-bottom: 16px;
  white-space: nowrap;
  overflow: hidden;
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

/* ---------- 表单 ---------- */
.form {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.form .btn {
  margin-top: 14px;
}

.err {
  margin-top: 14px;
}
.err .x {
  color: var(--err);
  flex: none;
}

.hint {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  line-height: 1.8;
  color: var(--dim-3);
  letter-spacing: 0.02em;
}
.hint b {
  color: var(--dim-2);
  font-weight: 400;
}

.term__status .spacer {
  margin-left: auto;
}
</style>
