# 本 fork 的改动

上游：[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（MIT），基于提交 `5861a42`（v0.4.1，2026-11-04）。
角色形象、动画、表情包、人设与绝大部分代码均来自原项目，署名与版权归原作者。

## 1. 插件接口加访问边界（安全）

**问题**：插件模式下 `/dsh-pet-7340/*` 挂在 DSH 的 Web 服务上，路由本身不做任何来源校验。
浏览器里任意网页都能向本机端口发「简单请求」（`text/plain` 的 POST 不触发 CORS 预检），
于是可以在你不知情时：

- `POST /dsh-pet-7340/chat`、`/whisper`：调用你配置的模型，**消耗你的额度**
- `POST /dsh-pet-7340/config`：把配置恢复默认
- `POST /dsh-pet-7340/pet-avatar`、`/todos`、`/broadcast`……：改头像、塞待办、让宠物说话

**修复**：新增 `dsh-pet/src/host/plugin/request-guard.ts`，在读请求体之前判断：

| 情况 | 结果 |
| --- | --- |
| DSH 自己的页面（同源） | 放行 |
| 手机通过局域网 IP 打开 DSH（同源） | 放行 |
| curl / 脚本 / 其他插件的 Node 侧调用（不带 Origin） | 放行 |
| 跨站网页（`Sec-Fetch-Site: cross-site / same-site`，或 Origin 与 Host 不同） | 403 |
| DNS 重绑定（Host 是外部域名） | 403 |
| 沙箱页 / file 页的写请求（`Origin: null`） | 403 |

用自定义主机名访问 DSH（例如内网穿透域名）时，把主机名写进环境变量：

```
DSH_PET_ALLOWED_HOSTS=mypc.lan,pet.example.com
```

独立模式 / 打包应用不受影响：它们自己的 server 已经做了回环 Host + 跨站 + 令牌校验，
替身 webServer 带 `preAuthorized: true` 标记，跳过这一层。
桌面透明窗走 `dsh-pet-bridge://` 管道，不经过 HTTP，也不受影响。

测试：`src/host/plugin/request-guard.test.ts`（14 条）；全量 2372 条测试 0 失败，typecheck / lint / format / openapi / 依赖环检查全部通过。

## 2. 删除去水印脚本

删除 `scripts/watermark_step01.py`、`scripts/fill_nn.py`、`scripts/make_mask_black.py`、
`video/watermark_mask_v5.mkv`。`chroma_step02.py` 改为直接读 `video/` 源视频。

原因：《人工智能生成合成内容标识办法》（2025-09-01 起施行）要求不得恶意删除、篡改、隐匿 AI 生成标识；
本 fork 会对外分发，不提供去水印工具。源视频请使用生成平台正规的无水印导出。

> 原项目 npm 包本来就不含这些脚本（`files` 白名单只发插件本体），所以这一条只影响「自己做宠物」的素材链。

## 安装本 fork（Windows）

1. 先在 DSH「插件」页**卸载**原版 `dsh-pet`（两者同名，不能共存），完全退出 DSH（含托盘）。
2. 解压 `dsh-pet-plugin-fork.zip` 到固定位置，例如 `%USERPROFILE%\.dsh\plugins\dsh-pet`。
3. 打开 DSH → 插件 → 添加插件 → 选择这个文件夹；或命令行：
   ```
   dsh plugin --profile desktop add file:%USERPROFILE%/.dsh/plugins/dsh-pet
   ```
   （`dsh web` 用户把 `desktop` 换成 `web`）
4. 重开 DSH。

## 从源码构建

```
cd dsh-pet
pnpm install
npm run build      # 生成 lib/
npm test
```
