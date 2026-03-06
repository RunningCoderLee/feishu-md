/**
 * 从飞书文档链接中提取 document_id
 *
 * 支持的链接格式:
 * - https://example.feishu.cn/docx/doxcnXXXXXXXXXXX
 * - https://example.feishu.cn/wiki/wikcnXXXXXXXXXXX
 * - https://example.feishu.cn/docs/doccnXXXXXXXXXXX
 */
export function parseDocumentId(url: string): string {
  // 更严格的正则: 必须匹配 /docx/、/wiki/ 或 /docs/ 后跟文档 ID
  const regex = /\/(?:docx|wiki|docs)\/([a-zA-Z0-9_-]+)(?:[?#]|$)/;
  const match = url.match(regex);

  if (!match) {
    throw new Error(`无效的飞书文档链接: ${url}`);
  }

  return match[1];
}
