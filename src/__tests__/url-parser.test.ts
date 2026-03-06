import { describe, expect, it } from 'vitest';
import { parseDocumentId } from '../parser/url-parser.js';

describe('parseDocumentId', () => {
  it('解析 docx 链接', () => {
    expect(parseDocumentId('https://example.feishu.cn/docx/doxcnABC123')).toBe('doxcnABC123');
  });

  it('解析 wiki 链接', () => {
    expect(parseDocumentId('https://example.feishu.cn/wiki/wikcnXYZ456')).toBe('wikcnXYZ456');
  });

  it('解析 docs 链接', () => {
    expect(parseDocumentId('https://example.feishu.cn/docs/doccnDEF789')).toBe('doccnDEF789');
  });

  it('解析带 query string 的链接', () => {
    expect(parseDocumentId('https://example.feishu.cn/docx/doxcnABC123?from=wiki')).toBe(
      'doxcnABC123',
    );
  });

  it('解析带 hash 的链接', () => {
    expect(parseDocumentId('https://example.feishu.cn/wiki/wikcnXYZ456#section')).toBe(
      'wikcnXYZ456',
    );
  });

  it('解析带 query 和 hash 的链接', () => {
    expect(parseDocumentId('https://example.feishu.cn/docs/doccnDEF789?a=1#top')).toBe(
      'doccnDEF789',
    );
  });

  it('无效链接抛错', () => {
    expect(() => parseDocumentId('https://example.com/invalid')).toThrow('无效的飞书文档链接');
  });

  it('空字符串抛错', () => {
    expect(() => parseDocumentId('')).toThrow('无效的飞书文档链接');
  });

  it('不含文档路径的飞书链接抛错', () => {
    expect(() => parseDocumentId('https://example.feishu.cn/drive/folder/abc')).toThrow(
      '无效的飞书文档链接',
    );
  });
});
