/** 展示层的格式化辅助。 */

/** 把字节数格式化成人类可读的形式，用于配额与文件大小展示。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  // 小于 10 时留一位小数，否则取整——避免出现 "1023.9 KB" 这种噪声
  const fixed = value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value).toString()
  return `${fixed} ${units[unit]}`
}

/**
 * 十进制（SI）口径的字节数格式化：1 kB = 1000 B。
 *
 * 只用于 **R2 占用** 的展示（存储条与账户面板）。Cloudflare 的计费、
 * dashboard、wrangler 全部按十进制换算——同一个 3,903,092,651 字节，
 * 二进制读作 3.6 GB、十进制读作 3.9 GB。这个面板存在的意义就是
 * 「对上 dashboard 的数」，所以这里必须用 SI，否则每次都要心算一遍差在哪。
 *
 * 文件大小（表格、详情栏）仍用 formatBytes 的二进制口径，与操作系统一致。
 */
export function formatBytesSI(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  const units = ['B', 'kB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0

  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }

  const fixed = value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value).toString()
  return `${fixed} ${units[unit]}`
}

/** 把 Unix 秒格式化成 `YYYY-MM-DD HH:mm`（本地时区）。 */
export function formatTime(seconds?: number): string {
  if (!seconds) return '—'
  const d = new Date(seconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* ==================== Cloudflare 图片转换 ==================== */

/** Cloudflare 转换前缀，抽成常量便于 thumbUrl 判断幂等。 */
const TRANSFORM_MARK = '/cdn-cgi/image/'

/**
 * 把 R2 直出地址改写成 Cloudflare Image Transformations 地址。
 *
 *   https://img.june-t.top/u/xxx/01ABC.jpg
 *   →
 *   https://img.june-t.top/cdn-cgi/image/format=auto,onerror=redirect,quality=70,width=96/u/xxx/01ABC.jpg
 *
 * 实测同一张 401 KB 的原图压到 1.7 KB，省 229 倍。
 *
 * 三条设计约束：
 *
 * 1. **这是纯展示层的改写。** 分享出去的链接永远用原图地址，绝不带 `/cdn-cgi/image/`
 *    —— 否则别人拿到的链接会绑死在某个尺寸上。
 * 2. **带查询串的地址原样返回。** 私有图片走预签名 URL，改写路径会让签名失效。
 * 3. **`onerror=redirect` 是必需的兜底。** 免费额度为每月 5000 次「唯一转换」
 *    （同一张图 × 同一组参数算一次，按自然月重置），超限后 Cloudflare 返回 9422；
 *    有了这个参数它会自动回退到原图，最坏结果只是加载大图，不会出现碎图，也不会产生账单。
 *
 * 参数按字母序排列，这是 Cloudflare 推荐的写法（保证缓存键稳定）。
 */
export function thumbUrl(url: string, width: number, quality = 70): string {
  if (!url || url.includes('?') || url.includes(TRANSFORM_MARK)) return url

  const matched = /^(https?:\/\/[^/]+)(\/.*)$/.exec(url)
  if (!matched) return url

  const origin = matched[1]
  const path = matched[2]
  const opts = `format=auto,onerror=redirect,quality=${quality},width=${width}`
  return `${origin}${TRANSFORM_MARK}${opts}${path}`
}
