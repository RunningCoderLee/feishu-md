import type { FeishuApp } from '../api/app.js';
import { getDocumentBlocks } from '../api/blocks.js';
import { dumpDebugJson, isDebug } from '../utils/debug.js';
import { injectFrontMatter } from '../utils/front-matter.js';
import { convertBlocksToMarkdown } from './blocks.js';
import { cleanMarkdown } from './cleaner.js';

/**
 * 获取飞书文档的 Markdown 内容
 */
export async function fetchDocumentMarkdown(app: FeishuApp, documentId: string): Promise<string> {
  const blocks = await getDocumentBlocks(app, documentId);
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
