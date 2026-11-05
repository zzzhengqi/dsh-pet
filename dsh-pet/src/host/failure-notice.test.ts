/**
 * 主动操作失败提示的单元测试：余额不足、未选模型、其他失败各给一句，非生成类失败不提示。
 *
 * 跑法：node --experimental-strip-types --test src/host/failure-notice.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { failureNotice } from './failure-notice.ts';

test('余额不足（DeepSeek 原始报文）→ 提示充值或换模型', () => {
  const text = failureNotice('generate-error', 'Insufficient Balance (request_id: x)');
  assert.ok(text?.includes('余额不足'));
});

test('未选模型 → 提示去选模型', () => {
  assert.ok(failureNotice('provider-missing')?.includes('选一个模型'));
});

test('其他生成失败 → 指向日志', () => {
  assert.ok(failureNotice('generate-error', 'timeout')?.includes('logs.txt'));
});

test('非生成类失败（unknown-pet 等）→ 不提示', () => {
  assert.equal(failureNotice('unknown-pet', '没有这只桌宠'), undefined);
});
