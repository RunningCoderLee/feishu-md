/**
 * 飞书文档块共享类型定义
 * 供下载（converter）和上传（uploader）两侧共用
 */

/** 链接信息 */
export interface LinkInfo {
  url?: string;
}

/** 文本样式 */
export interface TextElementStyle {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  inline_code?: boolean;
  link?: LinkInfo;
}

/** 文本元素 */
export interface TextRun {
  content: string;
  text_element_style?: TextElementStyle;
}

/** 文档元素（下载侧 text_run 可选，上传侧总是存在） */
export interface DocumentElement {
  text_run?: TextRun;
}

/** 块内容（通用结构） */
export interface BlockContent {
  elements?: DocumentElement[];
}

/** 代码块样式 */
export interface CodeStyle {
  language?: number;
}

/** 代码块内容 */
export interface CodeContent extends BlockContent {
  style?: CodeStyle;
}

/** 图片内容 */
export interface ImageContent {
  token?: string;
}

/**
 * 飞书代码语言枚举映射（number → string）
 */
export const FEISHU_LANGUAGE_MAP: Record<number, string> = {
  1: 'plaintext',
  2: 'abap',
  3: 'ada',
  4: 'apache',
  5: 'apex',
  6: 'assembly',
  7: 'bash',
  8: 'csharp',
  9: 'cpp',
  10: 'c',
  11: 'cobol',
  12: 'css',
  13: 'coffeescript',
  14: 'd',
  15: 'dart',
  16: 'delphi',
  17: 'django',
  18: 'dockerfile',
  19: 'erlang',
  20: 'fortran',
  21: 'foxpro',
  22: 'go',
  23: 'groovy',
  24: 'html',
  25: 'htmlbars',
  26: 'http',
  27: 'haskell',
  28: 'json',
  29: 'java',
  30: 'javascript',
  31: 'julia',
  32: 'kotlin',
  33: 'latex',
  34: 'lisp',
  35: 'logo',
  36: 'lua',
  37: 'matlab',
  38: 'makefile',
  39: 'markdown',
  40: 'nginx',
  41: 'objective-c',
  42: 'openedgeabl',
  43: 'php',
  44: 'perl',
  45: 'postscript',
  46: 'power-shell',
  47: 'prolog',
  48: 'protobuf',
  49: 'python',
  50: 'r',
  51: 'rpm-spec',
  52: 'ruby',
  53: 'rust',
  54: 'sas',
  55: 'scss',
  56: 'sql',
  57: 'scala',
  58: 'scheme',
  59: 'scratch',
  60: 'shell',
  61: 'swift',
  62: 'thrift',
  63: 'typescript',
  64: 'vbscript',
  65: 'visual-basic',
  66: 'xml',
  67: 'yaml',
};

/**
 * 语言字符串 → 飞书语言编号（从 FEISHU_LANGUAGE_MAP 自动派生 + 常用别名）
 */
export const LANGUAGE_TO_CODE: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const [code, name] of Object.entries(FEISHU_LANGUAGE_MAP)) {
    map[name] = Number(code);
  }
  // 常用别名
  map.js = map.javascript;
  map.ts = map.typescript;
  map.py = map.python;
  map.sh = map.shell;
  map.yml = map.yaml;
  map.cs = map.csharp;
  map.text = map.plaintext;
  return map;
})();

/** 查询语言编号，未知语言返回 plaintext(1) */
export function getLanguageCode(language: string): number {
  return LANGUAGE_TO_CODE[language.trim().toLowerCase()] || 1;
}

/** 查询语言名称，未知编号返回 'plaintext' */
export function getLanguageName(code: number): string {
  return FEISHU_LANGUAGE_MAP[code] || 'plaintext';
}
