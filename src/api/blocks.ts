import type * as lark from '@larksuiteoapi/node-sdk';
import { formatApiError, withRetry } from '../utils/api-helpers.js';

/**
 * 获取文档所有块
 *
 * 文档: https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document-block/list
 *
 * @param client 飞书客户端
 * @param documentId 文档 ID
 * @returns 文档块列表
 */
export async function getDocumentBlocks(client: lark.Client, documentId: string): Promise<any[]> {
  try {
    const allBlocks: any[] = [];
    let pageToken: string | undefined;

    // 分页获取所有块
    do {
      const response = await withRetry(() =>
        client.docx.documentBlock.list({
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
