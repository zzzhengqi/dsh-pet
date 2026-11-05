/**
 * 插件模式 HTTP 前缀路由的访问边界：拦跨站请求与 DNS 重绑定。
 *
 * 背景：/dsh-pet-<n>/* 挂在 DSH 的 Web 服务上，本身不鉴权。浏览器里任何网页都能对本机端口
 * 发「简单请求」（text/plain 的 POST 不触发预检），于是可以偷偷调 /chat 消耗模型额度、
 * POST /config 重置配置。这里在进入业务路由前做三道判断：
 *   ① Host 必须是 localhost / *.localhost / IP 字面量，或 DSH_PET_ALLOWED_HOSTS 里登记的主机名
 *      （防 DNS 重绑定：evil.com 解析到 127.0.0.1 时 Host 是 evil.com，会被拒）；
 *   ② 浏览器声明 Sec-Fetch-Site 为 cross-site / same-site 一律拒（DSH 页面自己是 same-origin）；
 *   ③ 带 Origin 时必须与 Host 同源；Origin 为 null（沙箱页 / file://）的写请求拒绝。
 * 不带 Origin、不带 Sec-Fetch-* 的请求（curl、脚本、其他插件的 Node 侧调用）照常放行，
 * 保持「第三方脚本可直接调」的既有行为。
 * @module dsh-pet/src/host/plugin/request-guard
 */
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

/** 判定结果：放行，或带上拒绝原因（仅进日志与 403 文案，不含敏感信息）。 */
export type GuardVerdict = { ok: true } | { ok: false; reason: string };

/** 读取环境变量里额外放行的主机名（逗号分隔，不区分大小写，不含端口）。 */
function extraHosts(env: NodeJS.ProcessEnv): Set<string> {
  const raw = env.DSH_PET_ALLOWED_HOSTS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** 从 Host 头里拆出主机名（去端口、去 IPv6 方括号）。 */
export function hostnameOf(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end > 0 ? h.slice(1, end) : h;
  }
  const colon = h.lastIndexOf(':');
  return colon >= 0 && h.indexOf(':') === colon ? h.slice(0, colon) : h;
}

/** 主机名是否可信：本机名、IP 字面量（含局域网，手机访问要用），或用户显式登记。 */
function trustedHostname(name: string, env: NodeJS.ProcessEnv): boolean {
  if (name === 'localhost' || name.endsWith('.localhost')) return true;
  if (isIP(name) !== 0) return true;
  return extraHosts(env).has(name);
}

/**
 * 判定一个进入插件前缀路由的请求能否放行。
 * @param req - 原始请求（只读头）。
 * @param env - 环境变量（测试注入）。
 */
export function guardPluginRequest(
  req: { headers?: IncomingMessage['headers']; method?: string },
  env: NodeJS.ProcessEnv = process.env,
): GuardVerdict {
  // 进程内直接调用（测试、桌面 Helper 复用）没有请求头：不是浏览器，放行
  const headers = req.headers ?? {};
  const host = typeof headers.host === 'string' ? headers.host : '';
  const fromBrowser = headers.origin !== undefined || headers['sec-fetch-site'] !== undefined;
  // 浏览器一定带 Host；缺 Host 又带浏览器特征的请求视为伪造
  if (!host) return fromBrowser ? { ok: false, reason: 'missing-host' } : { ok: true };
  if (!trustedHostname(hostnameOf(host), env)) return { ok: false, reason: 'untrusted-host' };

  const site = headers['sec-fetch-site'];
  if (site === 'cross-site' || site === 'same-site') return { ok: false, reason: 'cross-site' };

  const origin = headers.origin;
  const method = (req.method ?? 'GET').toUpperCase();
  const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  if (origin === undefined) return { ok: true };
  if (origin === 'null') return isWrite ? { ok: false, reason: 'null-origin' } : { ok: true };
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return { ok: false, reason: 'bad-origin' };
  }
  if (originHost !== host.trim().toLowerCase()) return { ok: false, reason: 'cross-origin' };
  return { ok: true };
}
