import { describe, expect, it } from 'vitest';
import { BlockType, convertBlocksToMarkdown } from '../converter/blocks.js';

/** 辅助函数：构造一个带文本内容的块 */
function textBlock(
  id: string,
  type: BlockType,
  content: string,
  parentId?: string,
  children?: string[],
) {
  return {
    block_id: id,
    block_type: type,
    parent_id: parentId,
    children,
    ...(type === BlockType.PAGE ? { page: { elements: [{ text_run: { content } }] } } : {}),
    ...(type === BlockType.TEXT ? { text: { elements: [{ text_run: { content } }] } } : {}),
    ...(type === BlockType.HEADING1 ? { heading1: { elements: [{ text_run: { content } }] } } : {}),
    ...(type === BlockType.HEADING2 ? { heading2: { elements: [{ text_run: { content } }] } } : {}),
    ...(type === BlockType.HEADING3 ? { heading3: { elements: [{ text_run: { content } }] } } : {}),
    ...(type === BlockType.BULLET ? { bullet: { elements: [{ text_run: { content } }] } } : {}),
    ...(type === BlockType.ORDERED ? { ordered: { elements: [{ text_run: { content } }] } } : {}),
    ...(type === BlockType.QUOTE ? { quote: { elements: [{ text_run: { content } }] } } : {}),
    ...(type === BlockType.CALLOUT ? { callout: { elements: [{ text_run: { content } }] } } : {}),
  };
}

describe('convertBlocksToMarkdown', () => {
  it('空数组返回空字符串', () => {
    expect(convertBlocksToMarkdown([])).toBe('');
  });

  it('page 标题', () => {
    const blocks = [textBlock('root', BlockType.PAGE, 'My Document')];
    expect(convertBlocksToMarkdown(blocks)).toBe('# My Document');
  });

  it('文本块', () => {
    const blocks = [
      textBlock('root', BlockType.PAGE, 'Title', undefined, ['b1']),
      textBlock('b1', BlockType.TEXT, 'Hello world', 'root'),
    ];
    expect(convertBlocksToMarkdown(blocks)).toContain('Hello world');
  });

  it('各级标题', () => {
    const blocks = [
      textBlock('root', BlockType.PAGE, '', undefined, ['h1', 'h2', 'h3']),
      textBlock('h1', BlockType.HEADING1, 'H1', 'root'),
      textBlock('h2', BlockType.HEADING2, 'H2', 'root'),
      textBlock('h3', BlockType.HEADING3, 'H3', 'root'),
    ];
    const md = convertBlocksToMarkdown(blocks);
    expect(md).toContain('# H1');
    expect(md).toContain('## H2');
    expect(md).toContain('### H3');
  });

  it('无序列表（含嵌套深度）', () => {
    const blocks = [
      textBlock('root', BlockType.PAGE, '', undefined, ['b1']),
      { ...textBlock('b1', BlockType.BULLET, 'item1', 'root', ['b2']), children: ['b2'] },
      textBlock('b2', BlockType.BULLET, 'nested', 'b1'),
    ];
    const md = convertBlocksToMarkdown(blocks);
    expect(md).toContain('- item1');
    expect(md).toContain('  - nested');
  });

  it('有序列表', () => {
    const blocks = [
      textBlock('root', BlockType.PAGE, '', undefined, ['o1']),
      textBlock('o1', BlockType.ORDERED, 'first', 'root'),
    ];
    expect(convertBlocksToMarkdown(blocks)).toContain('1. first');
  });

  it('代码块', () => {
    const blocks = [
      textBlock('root', BlockType.PAGE, '', undefined, ['c1']),
      {
        block_id: 'c1',
        block_type: BlockType.CODE,
        parent_id: 'root',
        code: {
          elements: [{ text_run: { content: 'const x = 1;' } }],
          style: { language: 63 },
        },
      },
    ];
    const md = convertBlocksToMarkdown(blocks);
    expect(md).toContain('```typescript');
    expect(md).toContain('const x = 1;');
    expect(md).toContain('```');
  });

  it('引用块', () => {
    const blocks = [
      textBlock('root', BlockType.PAGE, '', undefined, ['q1']),
      textBlock('q1', BlockType.QUOTE, 'quoted text', 'root'),
    ];
    expect(convertBlocksToMarkdown(blocks)).toContain('> quoted text');
  });

  it('分割线', () => {
    const blocks = [
      textBlock('root', BlockType.PAGE, '', undefined, ['d1']),
      { block_id: 'd1', block_type: BlockType.DIVIDER, parent_id: 'root' },
    ];
    expect(convertBlocksToMarkdown(blocks)).toContain('---');
  });

  it('高亮块 (callout)', () => {
    const blocks = [
      textBlock('root', BlockType.PAGE, '', undefined, ['c1']),
      textBlock('c1', BlockType.CALLOUT, 'note text', 'root'),
    ];
    expect(convertBlocksToMarkdown(blocks)).toContain('> \u{1F4A1} note text');
  });

  it('图片', () => {
    const blocks = [
      textBlock('root', BlockType.PAGE, '', undefined, ['i1']),
      {
        block_id: 'i1',
        block_type: BlockType.IMAGE,
        parent_id: 'root',
        image: { token: 'img_token_123' },
      },
    ];
    expect(convertBlocksToMarkdown(blocks)).toContain('![图片](feishu-image:img_token_123)');
  });

  it('Mermaid AddOns', () => {
    const blocks = [
      textBlock('root', BlockType.PAGE, '', undefined, ['a1']),
      {
        block_id: 'a1',
        block_type: BlockType.ADD_ONS,
        parent_id: 'root',
        add_ons: {
          component_type_id: 'blk_631fefbbae02400430b8f9f4',
          record: JSON.stringify({ view: 'codeChart', data: 'graph TD\nA-->B', theme: 'default' }),
        },
      },
    ];
    const md = convertBlocksToMarkdown(blocks);
    expect(md).toContain('```mermaid');
    expect(md).toContain('graph TD\nA-->B');
  });

  it('表格', () => {
    const blocks = [
      textBlock('root', BlockType.PAGE, '', undefined, ['t1']),
      {
        block_id: 't1',
        block_type: BlockType.TABLE,
        parent_id: 'root',
        children: ['c1', 'c2', 'c3', 'c4'],
        table: {
          cells: ['c1', 'c2', 'c3', 'c4'],
          property: { row_size: 2, column_size: 2 },
        },
      },
      {
        block_id: 'c1',
        block_type: BlockType.TABLE_CELL,
        parent_id: 't1',
        children: ['c1t'],
      },
      textBlock('c1t', BlockType.TEXT, 'Header1', 'c1'),
      {
        block_id: 'c2',
        block_type: BlockType.TABLE_CELL,
        parent_id: 't1',
        children: ['c2t'],
      },
      textBlock('c2t', BlockType.TEXT, 'Header2', 'c2'),
      {
        block_id: 'c3',
        block_type: BlockType.TABLE_CELL,
        parent_id: 't1',
        children: ['c3t'],
      },
      textBlock('c3t', BlockType.TEXT, 'Val1', 'c3'),
      {
        block_id: 'c4',
        block_type: BlockType.TABLE_CELL,
        parent_id: 't1',
        children: ['c4t'],
      },
      textBlock('c4t', BlockType.TEXT, 'Val2', 'c4'),
    ];
    const md = convertBlocksToMarkdown(blocks);
    expect(md).toContain('| Header1 | Header2 |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| Val1 | Val2 |');
  });

  it('quote_container', () => {
    const blocks = [
      textBlock('root', BlockType.PAGE, '', undefined, ['qc1']),
      {
        block_id: 'qc1',
        block_type: BlockType.QUOTE_CONTAINER,
        parent_id: 'root',
        children: ['qt1', 'qt2'],
      },
      textBlock('qt1', BlockType.TEXT, 'Line 1', 'qc1'),
      textBlock('qt2', BlockType.TEXT, 'Line 2', 'qc1'),
    ];
    const md = convertBlocksToMarkdown(blocks);
    expect(md).toContain('> Line 1');
    expect(md).toContain('> Line 2');
  });
});
