export interface FrontMatter {
  feishu_doc_id?: string;
  [key: string]: unknown;
}

const FRONT_MATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * 从 Markdown 文本中解析 front-matter
 * 返回 { frontMatter, body } — body 是去掉 front-matter 后的正文
 */
export function parseFrontMatter(content: string): { frontMatter: FrontMatter; body: string } {
  const match = content.match(FRONT_MATTER_REGEX);
  if (!match) {
    return { frontMatter: {}, body: content };
  }

  const frontMatter: FrontMatter = {};
  const rawYaml = match[1];

  for (const line of rawYaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    frontMatter[key] = value;
  }

  const body = content.slice(match[0].length);
  return { frontMatter, body };
}

/**
 * 将 front-matter 注入到 Markdown 文本头部
 * 若已有 front-matter 则合并，否则在头部添加
 */
export function injectFrontMatter(content: string, data: FrontMatter): string {
  const { frontMatter: existing, body } = parseFrontMatter(content);
  const merged = { ...existing, ...data };

  const yamlLines = Object.entries(merged)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}: ${v}`);

  if (yamlLines.length === 0) return content;

  return `---\n${yamlLines.join('\n')}\n---\n${body}`;
}
