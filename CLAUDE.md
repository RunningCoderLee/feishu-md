# CLAUDE.md

飞书知识库文档与本地 Markdown 双向同步 CLI 工具，TypeScript + ESM。

## 项目结构

```
src/
  index.ts          # CLI 入口 (commander)
  config.ts         # 配置管理 (.feishurc)
  interactive/      # 交互式流程编排
    index.ts        #   主入口、错误处理
    config.ts       #   配置管理流程
    download.ts     #   下载流程
    upload.ts       #   上传流程
  api/              # 飞书 API 封装
  converter/        # 飞书文档块 → Markdown
  uploader/         # Markdown → 飞书文档块
  parser/           # URL 解析
  types/            # 类型定义
  utils/            # 工具函数 (文件操作、调试日志)
```

## 命令

```bash
pnpm dev          # 开发运行
pnpm build        # 编译
pnpm lint         # 检查
pnpm lint:fix     # 自动修复
pnpm test         # 测试
pnpm typecheck    # 类型检查
```

## 编码约束

### 风格

- Biome: 2 空格缩进, 100 字符行宽, 单引号, 尾逗号
- Conventional Commits, Husky + lint-staged + commitlint
- 路径别名: `@/*` → `./src/*`
- 修改代码前先运行 `pnpm lint` 和 `pnpm typecheck` 确认基线无误

### 设计原则

- **单一职责**: 每个文件/函数只做一件事。`interactive/` 按流程拆分就是典型示例
- **开闭原则**: 新增 block 类型时扩展 converter 和 uploader 的映射，不改已有分支
- **依赖倒置**: 业务逻辑依赖抽象接口 (如 `lark.Client` 类型)，不直接构造 SDK 实例
- **高内聚低耦合**: 模块内部自包含，模块间通过明确的导出接口通信；避免循环依赖
- **DRY**: 相似模式抽公共函数 (如 `createSimpleBlock`、`withRetry`)，但不为只用一次的逻辑建抽象

### 编码规则

- 先读后改: 修改文件前必须先读取理解上下文
- 最小变更: 只改需要改的，不顺手重构无关代码
- 不加冗余: 不添加用不到的错误处理、配置项、注释、类型注解
- 不留痕迹: 删除代码就彻底删，不留 `// removed` 或无用的重导出
- 安全优先: `.feishurc` 含敏感凭证，绝不提交到版本控制；展示时脱敏

### 飞书 API 注意

- 速率限制 ~3 次/秒，所有 API 调用走 `withRetry` + `throttle`
- 上传采用全量替换: 清空 → 重建，不做增量 diff
- Mermaid 用文档小组件 (block_type=40)，`component_type_id` = `blk_631fefbbae02400430b8f9f4`
- 引用容器 (block_type=34, quote_container) 是容器块，子块用嵌套块 API 创建
- wiki 链接含 node_token 而非 document_id，需 `getWikiNodeInfo` 转换
