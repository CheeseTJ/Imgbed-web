import { createRouter, createWebHistory } from 'vue-router'

import { authState, restore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** 标注为 true 则无需登录即可访问 */
    public?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'library',
      component: () => import('@/views/LibraryView.vue'),
    },
    {
      path: '/trash',
      name: 'trash',
      component: () => import('@/views/TrashView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

/**
 * 路由守卫：未登录一律送去 /login，并记下来路以便登录后跳回。
 *
 * restore() 只在第一次导航时真正发请求，它拿本地令牌去换 `/me`，
 * 以此确认会话仍然有效（令牌可能存在但早已过期）。
 */
router.beforeEach(async (to) => {
  if (to.meta.public) return true

  if (!authState.restored) await restore()

  if (!authState.user) {
    return {
      name: 'login',
      query: to.fullPath === '/' ? undefined : { next: to.fullPath },
    }
  }
  return true
})

export default router
