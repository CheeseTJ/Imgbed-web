import { createApp } from 'vue'

import { setUnauthorizedHandler } from '@/api/ucenter'
import App from '@/App.vue'
import router from '@/router'
import { refresh, reset } from '@/stores/auth'
import { setUsageRefresher } from '@/stores/gallery'
import '@/styles/main.css'

/**
 * 令牌彻底失效时的兜底：清掉内存态并回登录页。
 *
 * 用回调注入而不是在本文件里直接 import router 到 ucenter 里，
 * 是为了避免 ucenter → router → stores → ucenter 的循环依赖。
 */
setUnauthorizedHandler(() => {
  reset()
  void router.replace({ name: 'login' })
})

/**
 * 上传/删除完成后刷新侧栏配额。
 *
 * 同样用注入而不是让 gallery 直接 import auth：两个 store 互相引用会成环，
 * 而且「谁刷新谁」属于应用装配层的事，放在入口最清楚。
 */
setUsageRefresher(() => {
  refresh().catch(() => {
    /* 配额是辅助信息，刷新失败不该干扰上传结果 */
  })
})

createApp(App).use(router).mount('#app')
