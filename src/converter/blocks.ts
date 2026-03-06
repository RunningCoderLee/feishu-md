import {
  type BlockContent,
  type CodeContent,
  type DocumentElement,
  getLanguageName,
  type ImageContent,
  type TextElementStyle,
} from '../types/feishu-blocks.js';

/**
 * 飞书文档块类型
 */
export enum BlockType {
  PAGE = 1,
  TEXT = 2,
  HEADING1 = 3,
  HEADING2 = 4,
  HEADING3 = 5,
  HEADING4 = 6,
  HEADING5 = 7,
  HEADING6 = 8,
  HEADING7 = 9,
  HEADING8 = 10,
  HEADING9 = 11,
  BULLET = 12,
  ORDERED = 13,
  CODE = 14,
  QUOTE = 15,
  TODO = 17,
  CALLOUT = 19,
  DIVIDER = 22,
  IMAGE = 27,
  TABLE = 31,
  TABLE_CELL = 32,
  VIEW = 33,
  QUOTE_CONTAINER = 34,
  ADD_ONS = 40,
}

// ============ TypeScript 接口定义（仅 blocks.ts 专用） ============

/** 表格属性 */
interface TableProperty {
  row_size?: number;
  column_size?: number;
}

/** 表格内容 */
interface TableContent {
  cells?: string[];
  property?: TableProperty;
}

/** 文档小组件内容 (AddOns) */
interface AddOnsContent {
  component_id?: string;
  component_type_id?: string;
  record?: string;
}

/** 文档小组件 record 数据结构 */
interface AddOnsRecord {
  view?: string;
  data?: string;
  theme?: string;
}

/** 飞书文档块 */
interface FeishuBlock {
  block_id: string;
  block_type: BlockType;
  parent_id?: string;
  children?: string[];
  page?: BlockContent;
  text?: BlockContent;
  heading1?: BlockContent;
  heading2?: BlockContent;
  heading3?: BlockContent;
  heading4?: BlockContent;
  heading5?: BlockContent;
  heading6?: BlockContent;
  heading7?: BlockContent;
  heading8?: BlockContent;
  heading9?: BlockContent;
  bullet?: BlockContent;
  ordered?: BlockContent;
  code?: CodeContent;
  quote?: BlockContent;
  callout?: BlockContent;
  table?: TableContent;
  image?: ImageContent;
  add_ons?: AddOnsContent;
}

// ============ 块类型到字段名的映射 ============

const BLOCK_TYPE_TO_FIELD: Record<number, keyof FeishuBlock> = {
  [BlockType.PAGE]: 'page',
  [BlockType.TEXT]: 'text',
  [BlockType.HEADING1]: 'heading1',
  [BlockType.HEADING2]: 'heading2',
  [BlockType.HEADING3]: 'heading3',
  [BlockType.HEADING4]: 'heading4',
  [BlockType.HEADING5]: 'heading5',
  [BlockType.HEADING6]: 'heading6',
  [BlockType.HEADING7]: 'heading7',
  [BlockType.HEADING8]: 'heading8',
  [BlockType.HEADING9]: 'heading9',
  [BlockType.BULLET]: 'bullet',
  [BlockType.ORDERED]: 'ordered',
  [BlockType.CODE]: 'code',
  [BlockType.QUOTE]: 'quote',
  [BlockType.CALLOUT]: 'callout',
};

// ============ 文本处理函数（拆分后） ============

/**
 * 从块中获取元素列表
 */
function getElementsFromBlock(block: FeishuBlock): DocumentElement[] {
  const fieldName = BLOCK_TYPE_TO_FIELD[block.block_type] || 'text';
  const content = block[fieldName] as BlockContent | undefined;
  return content?.elements || [];
}

/**
 * 应用文本样式
 */
function applyTextStyles(text: string, style?: TextElementStyle): string {
  if (!style || !text) return text;

  let result = text;
  if (style.bold) result = `**${result}**`;
  if (style.italic) result = `*${result}*`;
  if (style.strikethrough) result = `~~${result}~~`;
  if (style.inline_code) result = `\`${result}\``;
  if (style.link?.url) {
    // 飞书链接 URL 是 percent-encoded 的，需要解码
    const url = decodeURIComponent(style.link.url);
    result = `[${result}](${url})`;
  }
  return result;
}

/**
 * 获取块的文本内容
 */
function getTextContent(block: FeishuBlock): string {
  const elements = getElementsFromBlock(block);

  return elements
    .filter((el) => el.text_run)
    .map((el) => applyTextStyles(el.text_run!.content || '', el.text_run!.text_element_style))
    .join('');
}

/**
 * 将飞书文档块转换为 Markdown
 *
 * @param blocks 文档块列表
 * @returns Markdown 内容
 */
export function convertBlocksToMarkdown(blocks: FeishuBlock[]): string {
  if (blocks.length === 0) return '';

  // 构建块映射
  const blockMap = new Map<string, FeishuBlock>();
  for (const block of blocks) {
    blockMap.set(block.block_id, block);
  }

  // 找到根块 (page 类型)
  const rootBlock = blocks.find((b) => b.block_type === BlockType.PAGE);
  if (!rootBlock) {
    // 如果没有 page 块,按顺序处理所有块
    return blocks
      .map((b) => convertBlock(b, blockMap, 0))
      .filter(Boolean)
      .join('\n\n');
  }

  // 从根块开始递归处理
  const lines: string[] = [];

  // 先输出文档标题(PAGE 块的内容)
  const pageTitle = getTextContent(rootBlock);
  if (pageTitle) {
    lines.push(`# ${pageTitle}`);
  }

  // 再处理子块
  processChildren(rootBlock, blockMap, lines, 0);

  return lines.join('\n\n');
}

/**
 * 递归处理子块
 */
function processChildren(
  parentBlock: FeishuBlock,
  blockMap: Map<string, FeishuBlock>,
  lines: string[],
  depth: number,
): void {
  const children = parentBlock.children || [];

  for (const childId of children) {
    const block = blockMap.get(childId);
    if (!block) continue;

    // 转换当前块
    const markdown = convertBlock(block, blockMap, depth);
    if (markdown) {
      lines.push(markdown);
    }

    // 递归处理子块 (除了表格单元格和引用容器,它们在各自的块中统一处理)
    if (
      block.block_type !== BlockType.TABLE_CELL &&
      block.block_type !== BlockType.QUOTE_CONTAINER
    ) {
      processChildren(block, blockMap, lines, depth + 1);
    }
  }
}

/**
 * 转换单个块
 */
function convertBlock(
  block: FeishuBlock,
  blockMap: Map<string, FeishuBlock>,
  depth: number,
): string {
  const blockType = block.block_type;

  switch (blockType) {
    case BlockType.PAGE:
      // 页面块已在 convertBlocksToMarkdown 中作为文档标题处理
      return '';

    case BlockType.TEXT:
      return getTextContent(block);

    case BlockType.HEADING1:
      return `# ${getTextContent(block)}`;

    case BlockType.HEADING2:
      return `## ${getTextContent(block)}`;

    case BlockType.HEADING3:
      return `### ${getTextContent(block)}`;

    case BlockType.HEADING4:
      return `#### ${getTextContent(block)}`;

    case BlockType.HEADING5:
      return `##### ${getTextContent(block)}`;

    case BlockType.HEADING6:
    case BlockType.HEADING7:
    case BlockType.HEADING8:
    case BlockType.HEADING9:
      return `###### ${getTextContent(block)}`;

    case BlockType.BULLET:
      return `${'  '.repeat(depth)}- ${getTextContent(block)}`;

    case BlockType.ORDERED:
      return `${'  '.repeat(depth)}1. ${getTextContent(block)}`;

    case BlockType.CODE:
      return convertCodeBlock(block);

    case BlockType.QUOTE:
      return `> ${getTextContent(block)}`;

    case BlockType.DIVIDER:
      return '---';

    case BlockType.TABLE:
      return convertTableBlock(block, blockMap);

    case BlockType.TABLE_CELL:
      return ''; // 单元格在表格中统一处理

    case BlockType.IMAGE:
      return convertImageBlock(block);

    case BlockType.CALLOUT:
      return `> 💡 ${getTextContent(block)}`;

    case BlockType.QUOTE_CONTAINER:
      return convertQuoteContainer(block, blockMap, depth);

    case BlockType.ADD_ONS:
      return convertAddOnsBlock(block);

    default:
      // 未知类型,尝试提取文本
      return getTextContent(block) || '';
  }
}

/**
 * 转换引用容器块 (quote_container)
 * 引用容器是一个包裹子块的容器，子块转换后每行加 `> ` 前缀
 */
function convertQuoteContainer(
  block: FeishuBlock,
  blockMap: Map<string, FeishuBlock>,
  depth: number,
): string {
  const children = block.children || [];
  const lines: string[] = [];

  for (const childId of children) {
    const child = blockMap.get(childId);
    if (!child) continue;
    const markdown = convertBlock(child, blockMap, depth);
    if (markdown) {
      // 多行内容（如代码块）每行都加 > 前缀
      lines.push(
        markdown
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n'),
      );
    }
  }

  return lines.join('\n');
}

/**
 * 转换代码块
 */
function convertCodeBlock(block: FeishuBlock): string {
  const languageCode = block.code?.style?.language || 1;
  const language = getLanguageName(languageCode);
  const code = getTextContent(block);
  return `\`\`\`${language}\n${code}\n\`\`\``;
}

/**
 * 转换文档小组件块 (AddOns)
 * 目前支持文本绘图 (Mermaid)，其他类型输出 HTML 注释占位
 */
function convertAddOnsBlock(block: FeishuBlock): string {
  const addOns = block.add_ons;
  const recordStr = addOns?.record?.trim();
  if (!recordStr) return '';

  try {
    const record = JSON.parse(recordStr) as AddOnsRecord;

    if (record.view === 'codeChart') {
      const data = record.data?.trim();
      if (data) {
        return `\`\`\`mermaid\n${data}\n\`\`\``;
      }
    }

    return `<!-- 不支持的飞书组件: ${addOns!.component_type_id || 'unknown'} -->`;
  } catch {
    return `<!-- 不支持的飞书组件: record 解析失败 -->`;
  }
}

/**
 * 转换表格块
 */
function convertTableBlock(block: FeishuBlock, blockMap: Map<string, FeishuBlock>): string {
  const table = block.table;
  if (!table || !table.cells || table.cells.length === 0) return '';

  const cellIds = table.cells;
  const columnSize = table.property?.column_size || 0;
  const rowSize = table.property?.row_size || 0;

  if (columnSize === 0 || rowSize === 0) return '';

  // 构建二维数组 (按行优先顺序)
  const rows: string[][] = [];
  for (let r = 0; r < rowSize; r++) {
    rows[r] = [];
    for (let c = 0; c < columnSize; c++) {
      const cellIndex = r * columnSize + c;
      if (cellIndex < cellIds.length) {
        const cellId = cellIds[cellIndex];
        const cell = blockMap.get(cellId);

        // 单元格的内容在其子块中，可能有多个段落
        let cellText = '';
        if (cell?.children && cell.children.length > 0) {
          cellText = cell.children
            .map((childId) => {
              const childBlock = blockMap.get(childId);
              return childBlock ? getTextContent(childBlock) : '';
            })
            .filter(Boolean)
            .join(' ');
        }

        rows[r][c] = cellText;
      } else {
        rows[r][c] = '';
      }
    }
  }

  // 转换为 Markdown 表格
  const lines: string[] = [];

  // 表头
  const header = rows[0] || [];
  lines.push(`| ${header.join(' | ')} |`);

  // 分隔线
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);

  // 数据行
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    lines.push(`| ${row.join(' | ')} |`);
  }

  return lines.join('\n');
}

/**
 * 转换图片块
 */
function convertImageBlock(block: FeishuBlock): string {
  const image = block.image;
  if (!image) return '';

  // 图片 token 需要通过另外的 API 下载
  const token = image.token || '';
  return `![图片](feishu-image:${token})`;
}
