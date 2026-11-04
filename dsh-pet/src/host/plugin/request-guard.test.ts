/**
 * 插件前缀路由访问边界的单元测试：钉住「DSH 自己的页面 / 手机局域网 / 脚本」放行，
 * 「跨站网页 / DNS 重绑定 / null 来源写请求」拒绝。
 *
 * 跑法：node --experimental-strip-types --test src/host/plugin/request-guard.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { guardPluginRequest, hostnameOf } from './request-guard.ts';

const req = (method: string, headers: Record<string, string>) => ({ method, headers });
const noEnv = {} as NodeJS.ProcessEnv;

describe('guardPluginRequest 放行', () => {
  test('DSH 页面同源请求（localhost）', () => {
    const v = guardPluginRequest(
      req('POST', { host: 'localhost:5173', origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' }),
      noEnv,
    );
    assert.deepEqual(v, { ok: true });
  });
  test('手机走局域网 IP 同源访问', () => {
    const v = guardPluginRequest(
      req('POST', { host: '192.168.1.8:5173', origin: 'http://192.168.1.8:5173', 'sec-fetch-site': 'same-origin' }),
      noEnv,
    );
    assert.equal(v.ok, true);
  });
  test('curl / 脚本：不带 Origin 与 Sec-Fetch', () => {
    assert.equal(guardPluginRequest(req('POST', { host: '127.0.0.1:5173' }), noEnv).ok, true);
  });
  test('进程内调用（无请求头）', () => {
    assert.equal(guardPluginRequest({ method: 'GET' }, noEnv).ok, true);
  });
  test('IPv6 回环', () => {
    assert.equal(guardPluginRequest(req('GET', { host: '[::1]:5173' }), noEnv).ok, true);
  });
  test('用户登记的主机名', () => {
    const env = { DSH_PET_ALLOWED_HOSTS: 'mypc.lan, other.example' } as NodeJS.ProcessEnv;
    assert.equal(
      guardPluginRequest(req('POST', { host: 'mypc.lan:5173', origin: 'http://mypc.lan:5173' }), env).ok,
      true,
    );
  });
  test('媒体子资源 GET 不带 Origin', () => {
    assert.equal(
      guardPluginRequest(req('GET', { host: 'localhost:5173', 'sec-fetch-site': 'same-origin' }), noEnv).ok,
      true,
    );
  });
});

describe('guardPluginRequest 拒绝', () => {
  test('跨站网页的 text/plain 简单 POST', () => {
    const v = guardPluginRequest(
      req('POST', { host: '127.0.0.1:5173', origin: 'https://evil.test', 'sec-fetch-site': 'cross-site' }),
      noEnv,
    );
    assert.deepEqual(v, { ok: false, reason: 'cross-site' });
  });
  test('旧浏览器没有 Sec-Fetch，但 Origin 不同源', () => {
    const v = guardPluginRequest(req('POST', { host: '127.0.0.1:5173', origin: 'https://evil.test' }), noEnv);
    assert.deepEqual(v, { ok: false, reason: 'cross-origin' });
  });
  test('本机别的端口（same-site）', () => {
    const v = guardPluginRequest(
      req('POST', { host: 'localhost:5173', origin: 'http://localhost:3000', 'sec-fetch-site': 'same-site' }),
      noEnv,
    );
    assert.equal(v.ok, false);
  });
  test('DNS 重绑定：Host 是外部域名', () => {
    const v = guardPluginRequest(
      req('POST', { host: 'evil.test:5173', origin: 'http://evil.test:5173', 'sec-fetch-site': 'same-origin' }),
      noEnv,
    );
    assert.deepEqual(v, { ok: false, reason: 'untrusted-host' });
  });
  test('null 来源的写请求', () => {
    const v = guardPluginRequest(req('POST', { host: 'localhost:5173', origin: 'null' }), noEnv);
    assert.deepEqual(v, { ok: false, reason: 'null-origin' });
  });
  test('缺 Host 却带浏览器特征', () => {
    assert.equal(guardPluginRequest(req('GET', { origin: 'https://evil.test' }), noEnv).ok, false);
  });
});

test('hostnameOf 去端口与方括号', () => {
  assert.equal(hostnameOf('LocalHost:80'), 'localhost');
  assert.equal(hostnameOf('[::1]:5173'), '::1');
  assert.equal(hostnameOf('example.test'), 'example.test');
});
