import type * as lark from '@larksuiteoapi/node-sdk';
import { BLOCK_DATA_FIELDS, BlockType } from '../types/feishu-blocks.js';
import type {
  FeishuUploadBlock,
  QuoteContainerData,
  TableCellContent,
} from '../uploader/md-parser.js';
import { formatApiError, withRetry } from '../utils/api-helpers.js';
import { getDocumentBlocks } from './blocks.js';

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
    throw formatApiError(error, '获取文档根块失败');
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
    throw formatApiError(error, '更新文档标题失败');
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
    throw formatApiError(error, '清空文档内容失败');
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
 * 创建引用容器块（使用创建嵌套块 API）
 * quote_container (block_type=34) 是容器块，子块在其 children 中
 */
async function createQuoteContainerBlock(
  client: lark.Client,
  documentId: string,
  parentBlockId: string,
  index: number,
  data: QuoteContainerData,
): Promise<void> {
  const containerId = 'qc_0';
  const childrenIds: string[] = [];
  const descendants: any[] = [];

  for (let i = 0; i < data.children.length; i++) {
    const child = data.children[i]!;
    const childId = `qc_child_${i}`;
    childrenIds.push(childId);

    // 从 FeishuUploadBlock 中提取对应的 block 数据字段
    const blockData: any = {
      block_id: childId,
      block_type: child.block_type,
      children: [],
    };

    // 复制块类型对应的数据字段
    for (const field of BLOCK_DATA_FIELDS) {
      if (child[field]) blockData[field] = child[field];
    }

    descendants.push(blockData);
  }

  const containerDescendant = {
    block_id: containerId,
    block_type: BlockType.QUOTE_CONTAINER,
    quote_container: {},
    children: childrenIds,
  };

  const response = await withRetry(() =>
    client.docx.documentBlockDescendant.create({
      path: {
        document_id: documentId,
        block_id: parentBlockId,
      },
      data: {
        index,
        children_id: [containerId],
        descendants: [containerDescendant, ...descendants],
      },
    } as any),
  );

  if (response.code !== 0) {
    throw new Error(`创建引用容器失败: ${response.msg} (code: ${response.code})`);
  }
}

/**
 * block_type 数字到名称的映射（用于错误日志）
 * 值必须与 BlockType 枚举一致
 */
const BLOCK_TYPE_NAMES: Record<number, string> = {
  [BlockType.PAGE]: 'PAGE',
  [BlockType.TEXT]: 'TEXT',
  [BlockType.HEADING1]: 'HEADING1',
  [BlockType.HEADING2]: 'HEADING2',
  [BlockType.HEADING3]: 'HEADING3',
  [BlockType.HEADING4]: 'HEADING4',
  [BlockType.HEADING5]: 'HEADING5',
  [BlockType.HEADING6]: 'HEADING6',
  [BlockType.BULLET]: 'BULLET',
  [BlockType.ORDERED]: 'ORDERED',
  [BlockType.CODE]: 'CODE',
  [BlockType.QUOTE]: 'QUOTE',
  [BlockType.TODO]: 'TODO',
  [BlockType.DIVIDER]: 'DIVIDER',
  [BlockType.IMAGE]: 'IMAGE',
  [BlockType.TABLE]: 'TABLE',
  [BlockType.TABLE_CELL]: 'TABLE_CELL',
  [BlockType.CALLOUT]: 'CALLOUT',
  [BlockType.QUOTE_CONTAINER]: 'QUOTE_CONTAINER',
  [BlockType.ADD_ONS]: 'ADD_ONS',
};

/**
 * 格式化 block 摘要用于错误日志
 */
function summarizeBlock(block: FeishuUploadBlock, index: number): string {
  const typeName = BLOCK_TYPE_NAMES[block.block_type] || `UNKNOWN(${block.block_type})`;

  // 提取各类型 block 的文本内容预览
  let blockData: any;
  for (const field of BLOCK_DATA_FIELDS) {
    if (block[field]) {
      blockData = block[field];
      break;
    }
  }
  const firstElement = blockData?.elements?.[0];
  const text = (firstElement as any)?.text_run?.content || '';
  const preview = text.length > 80 ? `${text.slice(0, 80)}...` : text;
  return `  [${index}] ${typeName}${preview ? `: "${preview}"` : ''}`;
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

  let pendingBlocks: FeishuUploadBlock[] = [];
  let pendingStartIndex = 0; // 记录 pending 块在原始 blocks 数组中的起始位置

  const flushPending = async () => {
    if (pendingBlocks.length === 0) return;

    for (let i = 0; i < pendingBlocks.length; i += batchSize) {
      const batch = pendingBlocks.slice(i, i + batchSize);
      const batchGlobalStart = pendingStartIndex + i;

      try {
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
      } catch (error) {
        const batchSummary = batch
          .map((b, idx) => summarizeBlock(b, batchGlobalStart + idx))
          .join('\n');
        console.error(
          `\n❌ 写入失败的批次 (block ${batchGlobalStart}-${batchGlobalStart + batch.length - 1}):\n${batchSummary}`,
        );
        throw formatApiError(
          error,
          `写入文档内容失败 (batch index ${insertIndex}, blocks ${batchGlobalStart}-${batchGlobalStart + batch.length - 1})`,
        );
      }

      insertIndex += batch.length;
    }

    pendingBlocks = [];
  };

  let globalIndex = 0;
  for (const block of blocks) {
    if (block.block_type === BlockType.TABLE && block.table_data) {
      await flushPending();
      try {
        await createTableBlock(client, documentId, rootBlockId, insertIndex, block.table_data);
      } catch (error) {
        const { row_size, column_size } = block.table_data.property;
        console.error(
          `\n❌ 写入失败的表格 (block ${globalIndex}): ${row_size}行 × ${column_size}列`,
        );
        throw formatApiError(
          error,
          `创建表格失败 (block ${globalIndex}, ${row_size}×${column_size})`,
        );
      }
      insertIndex++;
    } else if (block.block_type === BlockType.QUOTE_CONTAINER && block.quote_container_data) {
      await flushPending();
      try {
        await createQuoteContainerBlock(
          client,
          documentId,
          rootBlockId,
          insertIndex,
          block.quote_container_data,
        );
      } catch (error) {
        const childCount = block.quote_container_data.children.length;
        console.error(`\n❌ 写入失败的引用容器 (block ${globalIndex}): ${childCount} 个子块`);
        throw formatApiError(
          error,
          `创建引用容器失败 (block ${globalIndex}, ${childCount} children)`,
        );
      }
      insertIndex++;
    } else {
      if (pendingBlocks.length === 0) {
        pendingStartIndex = globalIndex;
      }
      pendingBlocks.push(block);
    }
    globalIndex++;
  }

  await flushPending();
}
