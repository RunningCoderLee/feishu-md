import { formatApiError } from '../utils/api-helpers.js';
import type { FeishuApp } from './app.js';

/**
 * 获取文档所有块
 *
 * 文档: https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document-block/list
 */
export async function getDocumentBlocks(app: FeishuApp, documentId: string): Promise<any[]> {
  try {
    const allBlocks: any[] = [];
    let pageToken: string | undefined;

    // 分页获取所有块
    do {
      const response = await app.withRetry(() =>
        app.client.docx.documentBlock.list({
          path: {
            document_id: documentId,
          },
          params: {
            page_size: 500,
            page_token: pageToken,
          },
        }),
      );

      if (response.code !== 0) {
        throw new Error(`获取文档块失败: ${response.msg} (code: ${response.code})`);
      }

      if (response.data?.items) {
        allBlocks.push(...response.data.items);
      }

      pageToken = response.data?.has_more ? response.data?.page_token : undefined;
    } while (pageToken);

    return allBlocks;
  } catch (error) {
    throw formatApiError(error, '获取文档块失败');
  }
}
