import { describe, expect, it } from 'vitest';
import { cleanMarkdown } from '../converter/cleaner.js';

describe('cleanMarkdown', () => {
  describe('emoji 清除', () => {
    it('移除 Unicode emoji', () => {
      expect(cleanMarkdown('Hello 😀 World')).toBe('Hello  World');
    });

    it('移除多个 emoji', () => {
      expect(cleanMarkdown('🎉 Test 🚀')).toBe('Test');
    });

    it('不影响普通文本', () => {
      expect(cleanMarkdown('Hello World')).toBe('Hello World');
    });
  });

  describe('格式标记空格清理', () => {
    it('清理开始标记后的空格', () => {
      expect(cleanMarkdown('** text**')).toBe('**text**');
    });

    it('清理结束标记前的空格', () => {
      expect(cleanMarkdown('**text **')).toBe('**text**');
    });

    it('清理斜体标记空格', () => {
      expect(cleanMarkdown('* text*')).toBe('*text*');
    });

    it('清理删除线标记空格', () => {
      expect(cleanMarkdown('~~ text~~')).toBe('~~text~~');
    });

    it('不误伤正常空格', () => {
      // 开始标记清理后 "** bold" → "**bold"，结束标记前 " **" 后跟字母不匹配关闭规则
      expect(cleanMarkdown('word ** bold ** word')).toBe('word **bold **word');
    });
  });

  describe('标题/列表标记与格式标记之间的空格修复', () => {
    it('修复标题后紧跟粗体缺失空格', () => {
      expect(cleanMarkdown('##**bold**')).toBe('## **bold**');
    });

    it('修复无序列表后紧跟粗体缺失空格', () => {
      expect(cleanMarkdown('-**bold**')).toBe('- **bold**');
    });

    it('修复有序列表后紧跟粗体缺失空格', () => {
      expect(cleanMarkdown('1.**bold**')).toBe('1. **bold**');
    });

    it('修复缩进列表', () => {
      // trim() 会移除前导空格，所以缩进被清除
      expect(cleanMarkdown('  -**bold**')).toBe('- **bold**');
    });
  });

  describe('多余空行合并', () => {
    it('3 个以上空行合并为 2 个', () => {
      expect(cleanMarkdown('a\n\n\n\nb')).toBe('a\n\nb');
    });

    it('2 个空行保持不变', () => {
      expect(cleanMarkdown('a\n\nb')).toBe('a\n\nb');
    });
  });

  describe('trim', () => {
    it('移除首尾空白', () => {
      expect(cleanMarkdown('  hello  ')).toBe('hello');
    });
  });
});
