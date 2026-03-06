import { BlockType } from '../converter/blocks.js';
import {
  type BlockContent,
  type CodeContent,
  type DocumentElement,
  getLanguageCode,
  type ImageContent,
  type TextElementStyle,
} from '../types/feishu-blocks.js';

export interface TableCellContent {
  elements: DocumentElement[];
}

export interface TableData {
  property: {
    row_size: number;
    column_size: number;
  };
  cells: TableCellContent[][];
}

export interface AddOnsData {
  component_type_id: string;
  record: string;
}

export interface QuoteContainerData {
  children: FeishuUploadBlock[];
}

export interface FeishuUploadBlock {
  block_type: BlockType;
  text?: BlockContent;
  heading1?: BlockContent;
  heading2?: BlockContent;
  heading3?: BlockContent;
  heading4?: BlockContent;
  heading5?: BlockContent;
  heading6?: BlockContent;
  bullet?: BlockContent;
  ordered?: BlockContent;
  code?: CodeContent;
  quote?: BlockContent;
  callout?: BlockContent;
  divider?: Record<string, never>;
  image?: ImageContent;
  table_data?: TableData;
  add_ons?: AddOnsData;
  quote_container?: Record<string, never>;
  quote_container_data?: QuoteContainerData;
}

// ============ 常量 ============

const IMAGE_LINE_REGEX = /^!\[[^\]]*\]\(feishu-image:([^)\s]+)\)$/;
const INLINE_TOKEN_REGEX = /(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)]+\))/;

/** 飞书文本绘图（Mermaid）小组件的 component_type_id */
const MERMAID_COMPONENT_TYPE_ID = 'blk_631fefbbae02400430b8f9f4';

const HEADING_BLOCK_TYPES: Record<number, { type: BlockType; field: string }> = {
  1: { type: BlockType.HEADING1, field: 'heading1' },
  2: { type: BlockType.HEADING2, field: 'heading2' },
  3: { type: BlockType.HEADING3, field: 'heading3' },
  4: { type: BlockType.HEADING4, field: 'heading4' },
  5: { type: BlockType.HEADING5, field: 'heading5' },
  6: { type: BlockType.HEADING6, field: 'heading6' },
};

// ============ 文本元素构建 ============

function createTextElements(text: string): DocumentElement[] {
  const elements = parseInlineElements(text);
  return elements.length > 0 ? elements : [{ text_run: { content: text } }];
}

function parseInlineElements(input: string): DocumentElement[] {
  const elements: DocumentElement[] = [];
  let remaining = input;

  while (remaining.length > 0) {
    const match = remaining.match(INLINE_TOKEN_REGEX);
    if (!match || match.index === undefined) {
      if (remaining) {
        elements.push({ text_run: { content: remaining } });
      }
      break;
    }

    if (match.index > 0) {
      elements.push({ text_run: { content: remaining.slice(0, match.index) } });
    }

    const token = match[0];
    const styled = parseStyledToken(token);
    if (styled) {
      elements.push(styled);
    }

    remaining = remaining.slice(match.index + token.length);
  }

  return elements;
}

function parseStyledToken(token: string): DocumentElement | null {
  const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (linkMatch) {
    return {
      text_run: {
        content: linkMatch[1],
        text_element_style: { link: { url: linkMatch[2] } },
      },
    };
  }

  let content: string;
  let style: TextElementStyle;

  if (token.startsWith('**') && token.endsWith('**')) {
    content = token.slice(2, -2);
    style = { bold: true };
  } else if (token.startsWith('*') && token.endsWith('*')) {
    content = token.slice(1, -1);
    style = { italic: true };
  } else if (token.startsWith('~~') && token.endsWith('~~')) {
    content = token.slice(2, -2);
    style = { strikethrough: true };
  } else if (token.startsWith('`') && token.endsWith('`')) {
    content = token.slice(1, -1);
    style = { inline_code: true };
  } else {
    return null;
  }

  return { text_run: { content, text_element_style: style } };
}

// ============ Block 构建 ============

function createSimpleBlock(blockType: BlockType, field: string, text: string): FeishuUploadBlock {
  return {
    block_type: blockType,
    [field]: { elements: createTextElements(text.trim()) },
  } as FeishuUploadBlock;
}

function createHeadingBlock(level: number, text: string): FeishuUploadBlock {
  const safeLevel = Math.min(Math.max(level, 1), 6);
  const { type, field } = HEADING_BLOCK_TYPES[safeLevel]!;
  return createSimpleBlock(type, field, text);
}

function parseCodeBlock(
  lines: string[],
  startIndex: number,
): { block: FeishuUploadBlock; endIndex: number } {
  const firstLine = lines[startIndex] || '';
  const language = firstLine.slice(3).trim();
  const codeLines: string[] = [];
  let i = startIndex + 1;

  while (i < lines.length) {
    if ((lines[i] || '').trim().startsWith('```')) break;
    codeLines.push(lines[i] || '');
    i++;
  }

  const content = codeLines.join('\n');

  // Mermaid 代码块 → 文档小组件 (add_ons)
  if (language.toLowerCase() === 'mermaid') {
    return {
      block: {
        block_type: BlockType.ADD_ONS,
        add_ons: {
          component_type_id: MERMAID_COMPONENT_TYPE_ID,
          record: JSON.stringify({ view: 'codeChart', data: content, theme: 'default' }),
        },
      },
      endIndex: i,
    };
  }

  return {
    block: {
      block_type: BlockType.CODE,
      code: {
        elements: [{ text_run: { content } }],
        style: { language: getLanguageCode(language) },
      },
    },
    endIndex: i,
  };
}

function parseImageBlock(line: string): FeishuUploadBlock | null {
  const match = line.match(IMAGE_LINE_REGEX);
  if (!match) return null;
  return { block_type: BlockType.IMAGE, image: { token: match[1] } };
}

// ============ 表格解析 ============

function looksLikeTableLine(line: string): boolean {
  return /^\|.*\|$/.test(line.trim());
}

function isTableSeparatorLine(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

function parseTableCells(line: string): string[] {
  const inner = line.trim().slice(1, -1);
  return inner.split('|').map((cell) => cell.trim());
}

function parseTableBlock(
  lines: string[],
  startIndex: number,
): { block: FeishuUploadBlock; endIndex: number } {
  const rows: string[][] = [];
  let i = startIndex;

  while (i < lines.length && looksLikeTableLine(lines[i]!.trim())) {
    const line = lines[i]!.trim();
    if (!isTableSeparatorLine(line)) {
      rows.push(parseTableCells(line));
    }
    i++;
  }

  if (rows.length === 0) {
    return {
      block: createSimpleBlock(BlockType.TEXT, 'text', lines[startIndex] || ''),
      endIndex: startIndex,
    };
  }

  const columnSize = Math.max(...rows.map((row) => row.length));

  const cells: TableCellContent[][] = rows.map((row) => {
    const paddedRow: TableCellContent[] = [];
    for (let c = 0; c < columnSize; c++) {
      paddedRow.push({ elements: createTextElements(row[c] || '') });
    }
    return paddedRow;
  });

  return {
    block: {
      block_type: BlockType.TABLE,
      table_data: {
        property: { row_size: rows.length, column_size: columnSize },
        cells,
      },
    },
    endIndex: i - 1,
  };
}

// ============ 引用容器解析 ============

/**
 * 收集连续的 `> ` 行，去掉前缀后解析内部内容为子块，
 * 整体包装为 quote_container (block_type=34)
 */
function parseQuoteContainerBlock(
  lines: string[],
  startIndex: number,
): { block: FeishuUploadBlock; endIndex: number } {
  const innerLines: string[] = [];
  let i = startIndex;

  // 收集连续的 > 行（包括空的 > 行）
  while (i < lines.length) {
    const line = lines[i] || '';
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) {
      // 去掉 > 前缀，保留内部内容
      const inner = trimmed.replace(/^>\s?/, '');
      innerLines.push(inner);
      i++;
    } else {
      break;
    }
  }

  // 将内部行解析为子块
  const children = parseInnerBlocks(innerLines);

  return {
    block: {
      block_type: BlockType.QUOTE_CONTAINER,
      quote_container: {},
      quote_container_data: { children },
    },
    endIndex: i - 1,
  };
}

/**
 * 解析引用容器内部的行为子块列表（复用主解析逻辑，但不跳过标题）
 */
function parseInnerBlocks(lines: string[]): FeishuUploadBlock[] {
  const blocks: FeishuUploadBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const trimmed = line.trim();

    if (!trimmed) continue;

    const bulletMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bulletMatch) {
      blocks.push(createSimpleBlock(BlockType.BULLET, 'bullet', bulletMatch[1] || ''));
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (orderedMatch) {
      blocks.push(createSimpleBlock(BlockType.ORDERED, 'ordered', orderedMatch[1] || ''));
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push(createHeadingBlock(headingMatch[1].length, headingMatch[2] || ''));
      continue;
    }

    blocks.push(createSimpleBlock(BlockType.TEXT, 'text', line));
  }

  return blocks;
}

// ============ 主解析函数 ============

export interface ParseMarkdownResult {
  blocks: FeishuUploadBlock[];
  /** 从 Markdown 中提取的第一个一级标题（文档标题） */
  title: string | null;
}

/**
 * 将 Markdown 文本解析为飞书可上传的 block 数组
 * - 跳过第一个一级标题（文档标题由飞书文档自身管理）
 */
export function parseMarkdownToBlocks(markdown: string): ParseMarkdownResult {
  const blocks: FeishuUploadBlock[] = [];
  const lines = markdown.split(/\r?\n/);
  let skippedTitle = false;
  let title: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (looksLikeTableLine(trimmed)) {
      const { block, endIndex } = parseTableBlock(lines, i);
      blocks.push(block);
      i = endIndex;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const { block, endIndex } = parseCodeBlock(lines, i);
      blocks.push(block);
      i = endIndex;
      continue;
    }

    if (trimmed === '---') {
      blocks.push({ block_type: BlockType.DIVIDER, divider: {} });
      continue;
    }

    const imageBlock = parseImageBlock(trimmed);
    if (imageBlock) {
      blocks.push(imageBlock);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2] || '';

      if (!skippedTitle && level === 1) {
        skippedTitle = true;
        title = text;
        continue;
      }

      blocks.push(createHeadingBlock(level, text));
      continue;
    }

    const calloutMatch = trimmed.match(/^>\s*💡\s*(.*)$/);
    if (calloutMatch) {
      blocks.push(createSimpleBlock(BlockType.CALLOUT, 'callout', calloutMatch[1] || ''));
      continue;
    }

    if (trimmed.startsWith('>')) {
      const { block, endIndex } = parseQuoteContainerBlock(lines, i);
      blocks.push(block);
      i = endIndex;
      continue;
    }

    const bulletMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bulletMatch) {
      blocks.push(createSimpleBlock(BlockType.BULLET, 'bullet', bulletMatch[1] || ''));
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (orderedMatch) {
      blocks.push(createSimpleBlock(BlockType.ORDERED, 'ordered', orderedMatch[1] || ''));
      continue;
    }

    blocks.push(createSimpleBlock(BlockType.TEXT, 'text', line));
  }

  return { blocks, title };
}
