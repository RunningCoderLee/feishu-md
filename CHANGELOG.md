# Changelog

## [0.4.0] - 2026-03-10

### Added

- 并发下载优化：引入 FIFO 限速队列（RequestQueue）替代时间戳节流，支持并发场景下的正确限速
- 下载并发控制：`withConcurrency` worker-pool 模式，默认 2 路并发下载
- 文档树并行构建：`getWikiNodeTree` 使用 `Promise.all` 并行获取兄弟节点
- 实时进度条：下载过程中显示彩色进度条，含已完成/总数、百分比、耗时
- 文档链接缓存：记住上次下载的文档链接和标题，回车即可复用
- 下载完成摘要：显示文档总数和总耗时

### Fixed

- 修复 `getDocumentBlocks` 分页逻辑：正确检查 `has_more` 字段
- 修复平铺下载模式路径提示文案
- 修复递归下载中 `Promise.all` 无并发上限的问题，改用 `withConcurrency`
- 修复平铺下载中 `nameCount` 误统计非文档类型节点导致的假性重名

## [0.1.2] - 2026-03-06

### Added

- Mermaid 图表上传支持：`mermaid` 代码块自动转换为飞书文档小组件（文本绘图），实现双向同步
- 上传时支持知识库（wiki）链接，自动解析 wiki 节点获取实际文档 ID

### Fixed

- 移除上传时仅支持 `/docx/` 链接的限制，现同时支持 `/docx/` 和 `/wiki/` 链接

## [0.1.1] - 2026-03-05

### Fixed

- 修复表格上传时飞书 API 返回 `invalid param` (code: 1770001) 的问题
  - 根因：`documentBlockChildren.create` 接口的 `row_size` 最大值为 9，超出限制时报错
  - 修复：改用 `documentBlockDescendant.create`（创建嵌套块）接口，一次调用完成整个表格结构创建
  - 副作用：API 调用次数从 1 + row * col 次降为 1 次，上传效率显著提升

## [0.1.0] - 2026-03-04

### Added

- 飞书知识库文档下载为本地 Markdown（支持单文档、递归子文档）
- 本地 Markdown 上传回写飞书文档（全量替换策略）
- 支持标题、正文、列表、代码块、表格、引用、高亮块、图片、分割线等元素
- 文本样式：加粗、斜体、删除线、行内代码、超链接
- 代码块语言识别（67 种语言）
- 自动注入 `feishu_doc_id` front-matter
- 凭证管理：`.feishurc` 文件 / 环境变量
- 交互式 CLI 界面
- 编译为独立二进制文件分发
