import type * as lark from '@larksuiteoapi/node-sdk';
import { BlockType } from '../converter/blocks.js';
import type { FeishuUploadBlock, TableCellContent } from '../uploader/md-parser.js';
import { getDocumentBlocks } from './blocks.js';

// ============ 限速与重试 ============

const REQUEST_INTERVAL_MS = 350; // ~2.8 次/秒，低于限制的 3 次/秒
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

function is429Error(error: unknown): boolean {
  if (error && typeof error === 'object' && 'response' in error) {
    const resp = (error as any).response;
    return resp?.status === 429;
  }
  if (Array.isArray(error)) {
    return error.some(
      (e) => Array.isArray(e) && e.some((item: any) => item?.response?.status === 429),
    );
  }
  return false;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await throttle();
      return await fn();
    } catch (error) {
      if (is429Error(error) && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
        console.log(`   ⏳ 请求限流，${(delay / 1000).toFixed(1)}s 后重试...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('重试次数已耗尽');
}

// ============ API 操作 ============

/**
 * 获取文档根块 ID、子块数量和当前标题
 */
export async function getDocumentRootInfo(
  client: lark.Client,
  documentId: string,
): Promise<{ rootBlockId: string; childCount: number; title: string }> {
  try {
    const blocks = await getDocumentBlocks(client, documentId);
    const pageBlock = blocks.find((item: any) => item.block_type === BlockType.PAGE);
    if (!pageBlock) {
      throw new Error('未找到文档根块');
    }

    if (!pageBlock.block_id) {
      throw new Error('未找到文档根块 ID');
    }

    // 从 page block 的 elements 中提取标题文本
    const elements = pageBlock.page?.elements || [];
    const title = elements
      .filter((el: any) => el.text_run)
      .map((el: any) => el.text_run.content || '')
      .join('');

    return {
      rootBlockId: pageBlock.block_id,
      childCount: pageBlock.children?.length || 0,
      title,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`获取文档根块失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 更新文档标题（修改 Page Block 的文本内容）
 */
export async function updateDocumentTitle(
  client: lark.Client,
  documentId: string,
  rootBlockId: string,
  title: string,
): Promise<void> {
  try {
    const response = await withRetry(() =>
      client.docx.documentBlock.patch({
        path: {
          document_id: documentId,
          block_id: rootBlockId,
        },
        data: {
          update_text_elements: {
            elements: [{ text_run: { content: title } }],
          },
        },
      }),
    );

    if (response.code !== 0) {
      throw new Error(`更新文档标题失败: ${response.msg} (code: ${response.code})`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`更新文档标题失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 删除文档根块下的所有子块（全量替换前清空）
 */
export async function clearDocumentBlocks(
  client: lark.Client,
  documentId: string,
  rootBlockId: string,
  childCount: number,
): Promise<void> {
  if (childCount <= 0) return;

  try {
    const response = await withRetry(() =>
      client.docx.documentBlockChildren.batchDelete({
        path: {
          document_id: documentId,
          block_id: rootBlockId,
        },
        data: {
          start_index: 0,
          end_index: childCount,
        },
      }),
    );

    if (response.code !== 0) {
      throw new Error(`清空文档内容失败: ${response.msg} (code: ${response.code})`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`清空文档内容失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 创建单个表格块并填充单元格内容（使用创建嵌套块 API，支持超过 9 行的表格）
 */
async function createTableBlock(
  client: lark.Client,
  documentId: string,
  parentBlockId: string,
  index: number,
  tableData: NonNullable<FeishuUploadBlock['table_data']>,
): Promise<void> {
  const { property, cells } = tableData;

  const tableId = 'tbl_0';
  const cellBlockIds: string[] = [];
  const descendants: any[] = [];

  // 为每个单元格生成 ID，并构建 table_cell + text 子块
  for (let r = 0; r < property.row_size; r++) {
    for (let c = 0; c < property.column_size; c++) {
      const cellId = `cell_${r}_${c}`;
      const textId = `txt_${r}_${c}`;
      cellBlockIds.push(cellId);

      const cellContent: TableCellContent | undefined = cells[r]?.[c];
      const hasContent = cellContent && cellContent.elements.length > 0;

      descendants.push({
        block_id: cellId,
        block_type: BlockType.TABLE_CELL,
        table_cell: {},
        children: [textId],
      });

      descendants.push({
        block_id: textId,
        block_type: BlockType.TEXT,
        text: {
          elements: hasContent ? cellContent.elements : [{ text_run: { content: '' } }],
        },
        children: [],
      });
    }
  }

  // 表格块本身
  const tableDescendant = {
    block_id: tableId,
    block_type: BlockType.TABLE,
    table: {
      property: {
        row_size: property.row_size,
        column_size: property.column_size,
      },
    },
    children: cellBlockIds,
  };

  const response = await withRetry(() =>
    client.docx.documentBlockDescendant.create({
      path: {
        document_id: documentId,
        block_id: parentBlockId,
      },
      data: {
        index,
        children_id: [tableId],
        descendants: [tableDescendant, ...descendants],
      },
    } as any),
  );

  if (response.code !== 0) {
    throw new Error(`创建表格失败: ${response.msg} (code: ${response.code})`);
  }
}

/**
 * 批量创建文档块（每批最多 50 条，表格块单独处理）
 */
export async function createDocumentBlocks(
  client: lark.Client,
  documentId: string,
  rootBlockId: string,
  blocks: FeishuUploadBlock[],
): Promise<void> {
  if (blocks.length === 0) return;

  const batchSize = 50;
  let insertIndex = 0;

  try {
    let pendingBlocks: FeishuUploadBlock[] = [];

    const flushPending = async () => {
      if (pendingBlocks.length === 0) return;

      for (let i = 0; i < pendingBlocks.length; i += batchSize) {
        const batch = pendingBlocks.slice(i, i + batchSize);

        const response = await withRetry(() =>
          client.docx.documentBlockChildren.create({
            path: {
              document_id: documentId,
              block_id: rootBlockId,
            },
            data: {
              index: insertIndex,
              children: batch as any,
            },
          }),
        );

        if (response.code !== 0) {
          throw new Error(`写入文档内容失败: ${response.msg} (code: ${response.code})`);
        }

        insertIndex += batch.length;
      }

      pendingBlocks = [];
    };

    for (const block of blocks) {
      if (block.block_type === BlockType.TABLE && block.table_data) {
        await flushPending();
        await createTableBlock(client, documentId, rootBlockId, insertIndex, block.table_data);
        insertIndex++;
      } else {
        pendingBlocks.push(block);
      }
    }

    await flushPending();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`写入文档内容失败: ${error.message}`);
    }
    throw error;
  }
}
