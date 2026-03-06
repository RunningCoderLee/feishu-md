import { describe, expect, it } from 'vitest';
import { getLanguageCode, getLanguageName } from '../types/feishu-blocks.js';

describe('getLanguageCode', () => {
  it('常见语言', () => {
    expect(getLanguageCode('javascript')).toBe(30);
    expect(getLanguageCode('typescript')).toBe(63);
    expect(getLanguageCode('python')).toBe(49);
    expect(getLanguageCode('go')).toBe(22);
    expect(getLanguageCode('rust')).toBe(53);
  });

  it('别名映射', () => {
    expect(getLanguageCode('js')).toBe(30);
    expect(getLanguageCode('ts')).toBe(63);
    expect(getLanguageCode('py')).toBe(49);
    expect(getLanguageCode('sh')).toBe(60);
    expect(getLanguageCode('yml')).toBe(67);
    expect(getLanguageCode('cs')).toBe(8);
  });

  it('大小写不敏感', () => {
    expect(getLanguageCode('JavaScript')).toBe(30);
    expect(getLanguageCode('PYTHON')).toBe(49);
  });

  it('未知语言回退 plaintext (1)', () => {
    expect(getLanguageCode('unknown_lang')).toBe(1);
    expect(getLanguageCode('')).toBe(1);
  });

  it('带空格的语言名', () => {
    expect(getLanguageCode('  typescript  ')).toBe(63);
  });
});

describe('getLanguageName', () => {
  it('常见编号', () => {
    expect(getLanguageName(30)).toBe('javascript');
    expect(getLanguageName(63)).toBe('typescript');
    expect(getLanguageName(49)).toBe('python');
    expect(getLanguageName(22)).toBe('go');
    expect(getLanguageName(7)).toBe('bash');
  });

  it('plaintext', () => {
    expect(getLanguageName(1)).toBe('plaintext');
  });

  it('未知编号回退 plaintext', () => {
    expect(getLanguageName(999)).toBe('plaintext');
    expect(getLanguageName(0)).toBe('plaintext');
  });
});
