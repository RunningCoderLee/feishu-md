import type * as lark from '@larksuiteoapi/node-sdk';
import { getDocumentBlocks } from '../api/blocks.js';
import { injectFrontMatter } from '../uploader/front-matter.js';
import { dumpDebugJson, isDebug } from '../utils/debug.js';
import { convertBlocksToMarkdown } from './blocks.js';
import { cleanMarkdown } from './cleaner.js';

/**
 * 获取飞书文档的 Markdown 内容
 *
 * @param client 飞书客户端
 * @param documentId 文档 ID
 * @returns Markdown 内容（清理后），如果文档为空则返回空字符串
 */
export async function fetchDocumentMarkdown(
  client: lark.Client,
  documentId: string,
): Promise<string> {
  const blocks = await getDocumentBlocks(client, documentId);
  if (blocks.length === 0) return '';

  if (isDebug()) {
    dumpDebugJson(`blocks-${documentId}.json`, blocks);
  }

  const rawContent = convertBlocksToMarkdown(blocks);
  const cleaned = cleanMarkdown(rawContent);

  // 只有标题（单行）没有正文的文档视为空文档
  if (!cleaned || !cleaned.includes('\n')) return '';

  return injectFrontMatter(cleaned, {
    feishu_doc_id: documentId,
  });
}
