import { describe, expect, it } from 'vitest';
import { injectFrontMatter, parseFrontMatter } from '../uploader/front-matter.js';

describe('parseFrontMatter', () => {
  it('解析标准 front-matter', () => {
    const input = '---\ntitle: Hello\nauthor: Test\n---\nBody content';
    const { frontMatter, body } = parseFrontMatter(input);
    expect(frontMatter).toEqual({ title: 'Hello', author: 'Test' });
    expect(body).toBe('Body content');
  });

  it('无 front-matter 返回空对象和原始内容', () => {
    const input = 'Just a body';
    const { frontMatter, body } = parseFrontMatter(input);
    expect(frontMatter).toEqual({});
    expect(body).toBe('Just a body');
  });

  it('多字段解析', () => {
    const input = '---\na: 1\nb: 2\nc: hello world\n---\n';
    const { frontMatter } = parseFrontMatter(input);
    expect(frontMatter).toEqual({ a: '1', b: '2', c: 'hello world' });
  });

  it('跳过注释行', () => {
    const input = '---\ntitle: Hello\n# this is a comment\nauthor: Test\n---\nBody';
    const { frontMatter } = parseFrontMatter(input);
    expect(frontMatter).toEqual({ title: 'Hello', author: 'Test' });
  });

  it('空 body', () => {
    const input = '---\ntitle: Hello\n---\n';
    const { frontMatter, body } = parseFrontMatter(input);
    expect(frontMatter).toEqual({ title: 'Hello' });
    expect(body).toBe('');
  });

  it('跳过空行和无冒号的行', () => {
    const input = '---\ntitle: Hello\n\ninvalid line\nkey: val\n---\nBody';
    const { frontMatter } = parseFrontMatter(input);
    expect(frontMatter).toEqual({ title: 'Hello', key: 'val' });
  });
});

describe('injectFrontMatter', () => {
  it('向无 front-matter 的内容添加', () => {
    const result = injectFrontMatter('Body', { title: 'Hello' });
    expect(result).toBe('---\ntitle: Hello\n---\nBody');
  });

  it('合并已有 front-matter', () => {
    const input = '---\ntitle: Old\n---\nBody';
    const result = injectFrontMatter(input, { author: 'Test' });
    expect(result).toContain('title: Old');
    expect(result).toContain('author: Test');
    expect(result).toContain('Body');
  });

  it('覆盖已有字段', () => {
    const input = '---\ntitle: Old\n---\nBody';
    const result = injectFrontMatter(input, { title: 'New' });
    expect(result).toContain('title: New');
    expect(result).not.toContain('title: Old');
  });

  it('过滤 undefined 和 null 值', () => {
    const result = injectFrontMatter('Body', { title: 'Hello', empty: undefined, nil: null });
    expect(result).toContain('title: Hello');
    expect(result).not.toContain('empty');
    expect(result).not.toContain('nil');
  });

  it('无有效字段时返回原始内容', () => {
    const result = injectFrontMatter('Body', { empty: undefined });
    expect(result).toBe('Body');
  });
});
