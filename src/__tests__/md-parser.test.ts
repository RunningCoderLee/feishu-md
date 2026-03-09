import { describe, expect, it } from 'vitest';
import { BlockType } from '../types/feishu-blocks.js';
import { parseMarkdownToBlocks } from '../uploader/md-parser.js';

describe('parseMarkdownToBlocks', () => {
  describe('标题处理', () => {
    it('提取第一个一级标题并跳过', () => {
      const { blocks, title } = parseMarkdownToBlocks('# Document Title\n\nSome text');
      expect(title).toBe('Document Title');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].block_type).toBe(BlockType.TEXT);
    });

    it('只跳过第一个一级标题', () => {
      const { blocks, title } = parseMarkdownToBlocks('# First\n\n# Second');
      expect(title).toBe('First');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].block_type).toBe(BlockType.HEADING1);
    });

    it('无一级标题时 title 为 null', () => {
      const { title } = parseMarkdownToBlocks('## Subtitle\n\nText');
      expect(title).toBeNull();
    });
  });

  describe('各种 block 类型', () => {
    it('普通文本', () => {
      const { blocks } = parseMarkdownToBlocks('Hello world');
      expect(blocks[0].block_type).toBe(BlockType.TEXT);
      expect(blocks[0].text?.elements?.[0].text_run?.content).toBe('Hello world');
    });

    it('各级标题 (2-6)', () => {
      const md = '## H2\n### H3\n#### H4\n##### H5\n###### H6';
      const { blocks } = parseMarkdownToBlocks(md);
      expect(blocks.map((b) => b.block_type)).toEqual([
        BlockType.HEADING2,
        BlockType.HEADING3,
        BlockType.HEADING4,
        BlockType.HEADING5,
        BlockType.HEADING6,
      ]);
    });

    it('无序列表', () => {
      const { blocks } = parseMarkdownToBlocks('- item1\n- item2');
      expect(blocks).toHaveLength(2);
      expect(blocks[0].block_type).toBe(BlockType.BULLET);
      expect(blocks[0].bullet?.elements?.[0].text_run?.content).toBe('item1');
    });

    it('有序列表', () => {
      const { blocks } = parseMarkdownToBlocks('1. first\n2. second');
      expect(blocks).toHaveLength(2);
      expect(blocks[0].block_type).toBe(BlockType.ORDERED);
    });

    it('代码块', () => {
      const { blocks } = parseMarkdownToBlocks('```typescript\nconst x = 1;\n```');
      expect(blocks[0].block_type).toBe(BlockType.CODE);
      expect(blocks[0].code?.elements?.[0].text_run?.content).toBe('const x = 1;');
      expect(blocks[0].code?.style?.language).toBe(63); // typescript
    });

    it('分割线', () => {
      const { blocks } = parseMarkdownToBlocks('---');
      expect(blocks[0].block_type).toBe(BlockType.DIVIDER);
    });

    it('图片', () => {
      const { blocks } = parseMarkdownToBlocks('![alt](feishu-image:token123)');
      expect(blocks[0].block_type).toBe(BlockType.IMAGE);
      expect(blocks[0].image?.token).toBe('token123');
    });

    it('表格', () => {
      const md = '| A | B |\n| --- | --- |\n| 1 | 2 |';
      const { blocks } = parseMarkdownToBlocks(md);
      expect(blocks[0].block_type).toBe(BlockType.TABLE);
      expect(blocks[0].table_data?.property.row_size).toBe(2);
      expect(blocks[0].table_data?.property.column_size).toBe(2);
    });

    it('callout (高亮块)', () => {
      const { blocks } = parseMarkdownToBlocks('> \u{1F4A1} Important note');
      expect(blocks[0].block_type).toBe(BlockType.CALLOUT);
    });

    it('mermaid 代码块转 add_ons', () => {
      const { blocks } = parseMarkdownToBlocks('```mermaid\ngraph TD\nA-->B\n```');
      expect(blocks[0].block_type).toBe(BlockType.ADD_ONS);
      expect(blocks[0].add_ons?.component_type_id).toBe('blk_631fefbbae02400430b8f9f4');
    });
  });

  describe('引用容器', () => {
    it('连续 > 行收集为 quote_container', () => {
      const { blocks } = parseMarkdownToBlocks('> line1\n> line2');
      expect(blocks[0].block_type).toBe(BlockType.QUOTE_CONTAINER);
      expect(blocks[0].quote_container_data?.children).toHaveLength(2);
    });

    it('引用容器内部子块正确解析', () => {
      const { blocks } = parseMarkdownToBlocks('> - bullet item\n> text line');
      const children = blocks[0].quote_container_data?.children || [];
      expect(children[0].block_type).toBe(BlockType.BULLET);
      expect(children[1].block_type).toBe(BlockType.TEXT);
    });
  });

  describe('parseInlineElements (通过 parseMarkdownToBlocks 间接测试)', () => {
    it('加粗', () => {
      const { blocks } = parseMarkdownToBlocks('**bold text**');
      const elements = blocks[0].text?.elements || [];
      expect(elements[0].text_run?.content).toBe('bold text');
      expect(elements[0].text_run?.text_element_style?.bold).toBe(true);
    });

    it('斜体', () => {
      const { blocks } = parseMarkdownToBlocks('*italic text*');
      const elements = blocks[0].text?.elements || [];
      expect(elements[0].text_run?.content).toBe('italic text');
      expect(elements[0].text_run?.text_element_style?.italic).toBe(true);
    });

    it('删除线', () => {
      const { blocks } = parseMarkdownToBlocks('~~strikethrough~~');
      const elements = blocks[0].text?.elements || [];
      expect(elements[0].text_run?.content).toBe('strikethrough');
      expect(elements[0].text_run?.text_element_style?.strikethrough).toBe(true);
    });

    it('行内代码', () => {
      const { blocks } = parseMarkdownToBlocks('`code`');
      const elements = blocks[0].text?.elements || [];
      expect(elements[0].text_run?.content).toBe('code');
      expect(elements[0].text_run?.text_element_style?.inline_code).toBe(true);
    });

    it('链接', () => {
      const { blocks } = parseMarkdownToBlocks('[link](https://example.com)');
      const elements = blocks[0].text?.elements || [];
      expect(elements[0].text_run?.content).toBe('link');
      expect(elements[0].text_run?.text_element_style?.link?.url).toBe('https://example.com');
    });

    it('混合样式', () => {
      const { blocks } = parseMarkdownToBlocks('normal **bold** and *italic*');
      const elements = blocks[0].text?.elements || [];
      expect(elements).toHaveLength(4);
      expect(elements[0].text_run?.content).toBe('normal ');
      expect(elements[1].text_run?.text_element_style?.bold).toBe(true);
      expect(elements[2].text_run?.content).toBe(' and ');
      expect(elements[3].text_run?.text_element_style?.italic).toBe(true);
    });
  });
});
