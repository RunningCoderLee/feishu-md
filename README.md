# 飞书文档 Markdown 同步工具

飞书知识库文档与本地 Markdown 文件的双向同步 CLI 工具。

## 功能

### 📥 下载（飞书 → Markdown）

- 单文档下载、递归下载子文档（保持层级 / 平铺）
- 自动注入 `feishu_doc_id` front-matter，方便后续上传回写

### 📤 上传（Markdown → 飞书）

- 读取 front-matter 中的 `feishu_doc_id` 自动定位目标文档
- 全量替换策略：清空远端内容后重建
- 支持 `feishu-image:token` 图片占位符回写

### 支持的文档元素

| 元素 | 下载 | 上传 | 备注 |
|------|------|------|------|
| 标题（H1-H6） | ✅ | ✅ | |
| 正文、引用、高亮块（Callout） | ✅ | ✅ | |
| 有序/无序列表（支持嵌套） | ✅ | ✅ | |
| 代码块（67 种语言） | ✅ | ✅ | |
| 表格 | ✅ | ✅ | 使用嵌套块 API，不受 9 行限制 |
| 超链接 | ✅ | ✅ | |
| 图片（token 占位符） | ✅ | ✅ | |
| 分割线 | ✅ | ✅ | |
| 文本样式（加粗/斜体/删除线/行内代码） | ✅ | ✅ | |
| Mermaid 图表 | ✅ | ✅ | 通过飞书文档小组件（文本绘图）实现双向同步 |

## 安装

### 方式一：直接安装（推荐给团队成员）

收到 `feishu-md` 二进制文件后，执行：

```bash
# 添加执行权限并移动到系统路径
chmod +x feishu-md
sudo mv feishu-md /usr/local/bin/

# macOS 提示"已损坏，无法打开"时，执行以下命令解除 Gatekeeper 限制
xattr -cr /usr/local/bin/feishu-md
```

### 方式二：从源码编译安装

```bash
bash install.sh
```

## 使用

```bash
feishu-md
```

交互流程：

1. 首次运行时配置飞书应用凭证（App ID / App Secret）
2. 选择操作：**下载** / **上传** / **查看修改配置**
3. **下载流程**：
   - 输入飞书文档链接
   - 如果文档包含子文档，选择下载方式（仅当前 / 保持层级 / 平铺）
   - 输入存储路径
4. **上传流程**：
   - 输入本地 Markdown 文件路径
   - 自动从 front-matter 读取 `feishu_doc_id`，或手动输入目标文档链接（支持 `/docx/` 和 `/wiki/` 链接）
   - 全量替换远端文档内容

## 配置

凭证按以下优先级查找：

1. 从当前目录向上查找 `.feishurc` 文件
2. 用户主目录 `~/.feishurc`

`.feishurc` 格式：

```json
{
  "appId": "your_app_id",
  "appSecret": "your_app_secret"
}
```

获取凭证：https://open.feishu.cn/app

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式运行
pnpm dev

# 构建
pnpm build

# 代码检查与格式化
pnpm lint          # 检查
pnpm lint:fix      # 自动修复
pnpm format        # 格式化

# 测试与类型检查
pnpm test          # 运行测试
pnpm typecheck     # 类型检查

# 编译为独立二进制（用于分发给团队成员）
pnpm build:bin
# 产物在 dist-bin/feishu-md

# 更新全局 CLI（修改代码后）
bash install.sh
```

### 技术栈

- TypeScript (strict mode, ES2022, ESM)
- pnpm 包管理，tsc 构建，bun build 编译独立二进制
- Biome (lint + format)，Husky + lint-staged + commitlint (Conventional Commits)
- vitest 测试框架

### 实现细节

- **飞书 API 限速**: 所有 API 调用内置节流 (~2.8 次/秒) 与指数退避重试 (最多 3 次)
- **上传策略**: 全量替换 — 清空远端文档所有子块后重建，不做增量 diff
- **Mermaid 图表**: 通过飞书文档小组件 (block_type=40, add_ons) 实现，而非代码块
- **wiki 链接**: wiki URL 中的 token 是 node_token，需通过 `getWikiNodeInfo` API 获取实际的 document_id (objToken) 才能操作文档内容
- **表格上传**: 使用嵌套块 API (`documentBlockDescendant.create`)，不受普通 API 9 行限制
