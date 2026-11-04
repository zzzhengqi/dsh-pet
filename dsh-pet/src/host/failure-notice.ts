/**
 * 主动操作失败时的提示气泡文案：把模型调用的失败原因翻译成一句用户看得懂、知道下一步做什么的话。
 *
 * 只用于「用户主动点的」入口（右键碎碎念、配图、对话）：点了没反应会被当成坏了。
 * 周期碎碎念与梦话照旧静默失败，避免每 5 分钟弹一次错误。
 * @module dsh-pet/src/host/failure-notice
 */

/** 余额 / 额度不足的常见报文（各家服务商写法不同，统一按小写匹配）。 */
const BALANCE_PATTERNS = ['insufficient balance', 'insufficient_quota', 'quota', 'balance', '余额', '额度', '402'];

/**
 * 生成失败提示文案。
 * @param reason - 生成侧的失败分类。
 * @param message - 上游原始报文（可能为空）。
 * @returns 一句提示；不需要提示的分类返回 undefined。
 */
export function failureNotice(reason: string, message?: string): string | undefined {
  if (reason === 'provider-missing') return '还没选模型哦～先在 DSH 里选一个模型，我就能说话啦';
  if (reason !== 'generate-error') return undefined;
  const lower = (message ?? '').toLowerCase();
  if (BALANCE_PATTERNS.some((p) => lower.includes(p))) {
    return '口粮吃光啦…当前模型余额不足，充值或在「桌宠配置」里换个模型再叫我吧';
  }
  return '这句没想出来…稍后再试试吧（原因记在 dsh-pet/logs.txt）';
}
