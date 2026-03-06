# CLAUDE.md

## 项目概述

feishu-md 是一个飞书知识库文档与本地 Markdown 文件的双向同步 CLI 工具，使用 TypeScript 编写。

## 技术栈

- **运行时**: Node.js (>=16), ESM
- **语言**: TypeScript (strict mode, ES2022)
- **包管理**: pnpm
- **构建**: tsc (发布), bun build (独立二进制)
- **代码质量**: Biome (lint + format), Husky + lint-staged + commitlint

## 项目结构

```
src/
  index.ts          # CLI 入口 (commander)
  config.ts         # 配置管理 (.feishurc / 环境变量)
  interactive.ts    # 交互式流程编排
  api/              # 飞书 API 客户端 (@larksuiteoapi/node-sdk)
  converter/        # 飞书文档块 ↔ Markdown 转换
  parser/           # URL 解析
  uploader/         # Markdown 上传 (front-matter, md-parser)
  types/            # 类型定义
  utils/            # 工具函数
```

## 常用命令

```bash
pnpm dev          # 开发模式运行
pnpm build        # TypeScript 编译
pnpm build:bin    # 编译独立二进制 (bun)
pnpm lint         # 代码检查 (biome)
pnpm lint:fix     # 自动修复
pnpm format       # 格式化
pnpm test         # 运行测试
pnpm typecheck    # 类型检查
```

## 代码规范

- 使用 Biome 进行 lint 和格式化 (2 空格缩进, 100 字符行宽, 单引号, 尾逗号)
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范
- 路径别名: `@/*` → `./src/*`
- Git hooks: pre-commit 运行 lint-staged, commit-msg 运行 commitlint

## 注意事项

- 配置文件 `.feishurc` 包含敏感凭证，不要提交到版本控制
- 飞书 API 有速率限制，批量操作时注意控制请求频率
- 上传采用全量替换策略：先清空远端内容再重建
- Mermaid 图表通过飞书文档小组件 (block_type=40, add_ons) 实现，component_type_id 为 `blk_631fefbbae02400430b8f9f4`
- 上传支持 docx 和 wiki 两种链接格式；wiki 链接需先通过 `getWikiNodeInfo` 获取实际文档 ID (objToken)
