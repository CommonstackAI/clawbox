![ClawBox banner](./banner.png)

<p align=\"center\">
  ClawBox 是 <a href=\"https://github.com/openclaw/openclaw\">OpenClaw</a> 网关的桌面客户端。它将 Tauri 外壳、React 前端和 Bun/Hono 后端整合为一个桌面工作流，支持聊天、会话、频道、定时任务、技能和引导流程。
</p>

<p align=\"center\">
  <a href=\"https://github.com/CommonstackAI/clawbox\"><strong>GitHub</strong></a>
  &nbsp;&nbsp;•&nbsp;&nbsp;
  <a href=\"https://github.com/CommonstackAI/clawbox/releases\"><strong>发布版本</strong></a>
  &nbsp;&nbsp;•&nbsp;&nbsp;
  <a href=\"https://github.com/CommonstackAI/clawbox/issues\"><strong>问题反馈</strong></a>
  &nbsp;&nbsp;•&nbsp;&nbsp;
  <a href=\"https://github.com/openclaw/openclaw\"><strong>OpenClaw</strong></a>
  &nbsp;&nbsp;•&nbsp;&nbsp;
  <a href=\"./README.md\"><strong>English</strong></a>
</p>

<hr />

## 项目范围

- ClawBox 在本仓库中以开源方式发布。
- OpenClaw 是独立的依赖项，**不随本仓库打包**。
- 建议使用 OpenClaw `2026.3.12` 或更新版本以获得最佳兼容性。

## 技术栈

- Tauri v2 外壳，位于 [`src-tauri/`](src-tauri)
- Bun/Hono 后端，位于 [`internal/`](internal)
- React 18 + Vite 前端，位于 [`src/`](src)

## 快速开始

### 1. 安装依赖

```bash
npm ci
```

### 2. 安装并启动 OpenClaw

```bash
npm install -g openclaw@latest
openclaw gateway run --dev --auth none --bind loopback --port 18789
```

如果你已在其他地方运行 OpenClaw，可在设置中或通过环境变量 `OPENCLAW_GATEWAY_URL` 将 ClawBox 指向对应的网关地址。

### 3. 启动 ClawBox

前端 + 后端：

```bash
npm run dev
```

桌面应用：

```bash
npm run tauri:dev
```

## 安装方式

| 平台 | 安装方式 |
| --- | --- |
| macOS | GitHub Releases 构建包或从源码构建 |
| Windows | GitHub Releases 构建包或从源码构建 |
| Linux | 目前仅支持从源码构建 |

发布与签名详情请参阅 [`docs/releasing.md`](docs/releasing.md)。

### macOS Gatekeeper 说明

当前 GitHub Releases 发布的 macOS `.dmg` 构建包尚未经过 Apple 公证。因此，即使下载文件本身完好，macOS 可能在首次启动时显示类似 'ClawBox 已损坏，无法打开' 的提示。

如果你信任从本仓库官方 GitHub Releases 页面下载的发布包，请先将 `ClawBox.app` 移动到 `/Applications`，然后移除隔离标志：

```bash
xattr -dr com.apple.quarantine /Applications/ClawBox.app
```

注意事项：

- 仅对从本仓库官方 GitHub Releases 页面下载的构建包执行此操作。
- 如果不希望绕过 Gatekeeper，请从源码构建 ClawBox。
- 一旦为公开发布版本配置了 macOS 签名和公证，此操作将不再必要。

## 构建与校验

```bash
npm run build:frontend
npm run build:backend
cargo check --manifest-path src-tauri/Cargo.toml
```

仓库卫生检查：

```bash
npm run scan:repo
npm run audit:licenses
npm run audit:deps
```

无需真实 OpenClaw 运行时的轻量冒烟测试：

```bash
npm run smoke:backend
```

## OpenClaw 兼容性

- 支持的基线版本：OpenClaw `>= 2026.3.12`
- 兼容性说明：[`docs/openclaw-compatibility.md`](docs/openclaw-compatibility.md)
- 模拟网关入口：[`scripts/mock-gateway.mjs`](scripts/mock-gateway.mjs)

## 贡献指南

- 贡献指南：[`CONTRIBUTING.md`](CONTRIBUTING.md)
- 安全政策：[`SECURITY.md`](SECURITY.md)
- 行为准则：[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- 依赖政策：[`docs/dependency-policy.md`](docs/dependency-policy.md)

## 开发说明

- 前端 API 请求通过本地后端 `http://127.0.0.1:13000` 转发。
- 后端通过 WebSocket RPC 与 OpenClaw 通信。
- 用户可见文本需在以下两个文件中保持同步：
  - [`src/locales/en/translation.json`](src/locales/en/translation.json)
  - [`src/locales/zh/translation.json`](src/locales/zh/translation.json)

## 支持边界

- 当桌面外壳、前端、后端桥接、引导 UI 或打包逻辑出现问题时，请在本仓库提交 Issue。
- 纯粹的网关协议缺陷、频道运行时缺陷或 OpenClaw 守护进程行为问题，请向 OpenClaw 报告，除非 ClawBox 明显是破坏协议的那一层。
- Issue 和 Pull Request 将尽力进行处理。维护者可能会将仅属于上游的问题重定向至 OpenClaw。

## 环境变量覆盖

从 [`.env.example`](.env.example) 复制或手动设置以下变量：

- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_GATEWAY_TOKEN`
- `CLAWBOX_HOME`
- `CLAWBOX_BACKEND_PORT`

## 许可证

MIT。详见 [`LICENSE`](LICENSE)。
