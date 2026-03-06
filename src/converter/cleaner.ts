/**
 * Unicode emoji 范围列表
 * 参考: https://unicode.org/emoji/charts/full-emoji-list.html
 */
const EMOJI_RANGES: Array<[number, number]> = [
  [0x1f600, 0x1f64f], // 表情符号
  [0x1f300, 0x1f5ff], // 符号和图标
  [0x1f680, 0x1f6ff], // 交通和地图符号
  [0x1f700, 0x1f77f], // 炼金术符号
  [0x1f780, 0x1f7ff], // 几何图形扩展
  [0x1f800, 0x1f8ff], // 补充箭头-C
  [0x1f900, 0x1f9ff], // 补充符号和图标
  [0x1fa00, 0x1fa6f], // 棋子符号
  [0x1fa70, 0x1faff], // 符号和图标扩展-A
  [0x2600, 0x26ff], // 杂项符号
  [0x2700, 0x27bf], // 装饰符号
  [0xfe00, 0xfe0f], // 变体选择符
];

/**
 * 构建合并的 emoji 正则表达式
 */
const EMOJI_REGEX = new RegExp(
  EMOJI_RANGES.map(([start, end]) => `[\\u{${start.toString(16)}}-\\u{${end.toString(16)}}]`).join(
    '|',
  ),
  'gu',
);

/**
 * 清理 Markdown 中的 emoji 和其他无用内容
 *
 * @param content 原始 Markdown 内容
 * @returns 清理后的 Markdown 内容
 */
export function cleanMarkdown(content: string): string {
  let cleaned = content;

  // 1. 移除 Unicode emoji（使用合并的正则）
  // 注意: 不清理 :xxx: shortcode，飞书 API 返回的 emoji 以 Unicode 字符形式存在
  cleaned = cleaned.replace(EMOJI_REGEX, '');

  // 2. 清理 emoji 删除后留下的多余空格
  cleaned = cleaned.replace(/(\*\*|\*|~~)[ \t]+(?!\|)/g, '$1'); // 开始标记后的空格(但不在 | 前)
  cleaned = cleaned.replace(/(?<!\||#| )[ \t]+(\*\*|\*|~~)/g, '$1'); // 结束标记前的空格(但不在 | 或 # 或空格后)

  // 3. 修复格式标记与标题/列表标记之间缺失的空格
  cleaned = cleaned.replace(/^(#{1,6})\*\*/gm, '$1 **');
  cleaned = cleaned.replace(/^(\d+\.|[-*])\*\*/gm, '$1 **');
  cleaned = cleaned.replace(/^ {2}(\d+\.|[-*])\*\*/gm, '  $1 **');
  cleaned = cleaned.replace(/^ {4}(\d+\.|[-*])\*\*/gm, '    $1 **');

  // 4. 移除多余的空行 (3 个或更多空行合并为 2 个)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 5. 移除行首和行尾的空白字符
  cleaned = cleaned.trim();

  return cleaned;
}
