import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import inquirer from 'inquirer';
import type { createFeishuClient } from '../api/client.js';
import {
  clearDocumentBlocks,
  createDocumentBlocks,
  getDocumentRootInfo,
  updateDocumentTitle,
} from '../api/upload.js';
import { getWikiNodeInfo } from '../api/wiki.js';
import { parseDocumentId } from '../parser/url-parser.js';
import { parseFrontMatter } from '../uploader/front-matter.js';
import { parseMarkdownToBlocks } from '../uploader/md-parser.js';

// ============ Prompt ============

/**
 * 提示用户输入本地 Markdown 文件路径
 */
async function promptMarkdownPath(): Promise<string> {
  const { markdownPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'markdownPath',
      message: '请输入本地 Markdown 文件路径:',
      validate: (input: string) => (input.trim() ? true : '文件路径不能为空'),
      transformer: (input: string) => {
        if (input.trim()) {
          return `${input}  →  ${resolve(input)}`;
        }
        return input;
      },
    },
  ]);

  return markdownPath;
}

/**
 * 提示用户输入上传目标文档链接（支持 docx 和 wiki）
 */
async function promptUploadDocumentUrl(): Promise<string> {
  const { url } = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: '请输入目标飞书文档链接（支持 /docx/ 和 /wiki/）:',
      validate: (input: string) => {
        if (!input.trim()) return '文档链接不能为空';
        if (!input.includes('/docx/') && !input.includes('/wiki/'))
          return '请输入有效的飞书文档链接（需包含 /docx/ 或 /wiki/）';
        return true;
      },
    },
  ]);

  return url;
}

// ============ 标题处理 ============

/**
 * 确定上传使用的文档标题
 *
 * 比较本地 H1 标题和文件名：
 * - 两者一致 → 使用该标题更新远端
 * - 两者不一致 → 询问用户选择
 * - 只有一个存在 → 使用存在的那个
 */
async function resolveTitle(
  h1Title: string | null,
  fileName: string,
  remoteTitle: string,
): Promise<string | null> {
  const h1 = h1Title?.trim() || null;
  const fn = fileName.trim() || null;

  if (!h1 && !fn) return null;

  if (!h1) return fn;
  if (!fn) return h1;

  if (h1 === fn) return h1;

  console.log('');
  console.log('⚠️  文档标题不一致:');
  console.log(`   文件名:    ${fn}`);
  console.log(`   一级标题:  ${h1}`);
  console.log(`   远端标题:  ${remoteTitle}`);

  const { choice } = await inquirer.prompt([
    {
      type: 'select',
      name: 'choice',
      message: '请选择要使用的文档标题:',
      choices: [
        { name: `📄 使用文件名: ${fn}`, value: 'file' },
        { name: `📝 使用一级标题: ${h1}`, value: 'h1' },
        { name: `☁️  保持远端标题不变: ${remoteTitle}`, value: 'remote' },
      ],
    },
  ]);

  if (choice === 'file') return fn;
  if (choice === 'h1') return h1;
  return null;
}

// ============ 主入口 ============

/**
 * 执行上传流程
 */
export async function executeUploadFlow(
  client: ReturnType<typeof createFeishuClient>,
): Promise<void> {
  const markdownPath = await promptMarkdownPath();
  const absolutePath = resolve(markdownPath);

  let content: string;
  try {
    content = readFileSync(absolutePath, 'utf-8');
  } catch {
    throw new Error(`读取文件失败: ${absolutePath}`);
  }

  const { frontMatter, body } = parseFrontMatter(content);
  let documentId = typeof frontMatter.feishu_doc_id === 'string' ? frontMatter.feishu_doc_id : null;
  if (!documentId) {
    console.log('⚠️  未从 front-matter 读取到 feishu_doc_id');
    const url = await promptUploadDocumentUrl();
    const token = parseDocumentId(url);

    if (url.includes('/wiki/')) {
      console.log('');
      console.log('🔍 从知识库节点获取文档信息...');
      const nodeInfo = await getWikiNodeInfo(client, token);
      if (nodeInfo.objType !== 'docx' && nodeInfo.objType !== 'doc') {
        throw new Error(`不支持的文档类型: ${nodeInfo.objType}，仅支持 docx 类型的文档`);
      }
      console.log(`   文档标题: ${nodeInfo.title}`);
      documentId = nodeInfo.objToken;
    } else {
      documentId = token;
    }
  }

  const { blocks: uploadBlocks, title: localTitle } = parseMarkdownToBlocks(body);

  const fileBaseName = absolutePath.replace(/^.*[\\/]/, '').replace(/\.md$/i, '');

  console.log('');
  console.log('🔍 获取远端文档信息...');
  const {
    rootBlockId,
    childCount,
    title: remoteTitle,
  } = await getDocumentRootInfo(client, documentId);

  const finalTitle = await resolveTitle(localTitle, fileBaseName, remoteTitle);
  if (finalTitle && finalTitle !== remoteTitle) {
    console.log(`📝 更新文档标题: ${finalTitle}`);
    await updateDocumentTitle(client, documentId, rootBlockId, finalTitle);
  }

  console.log('🧹 清空远端文档内容...');
  await clearDocumentBlocks(client, documentId, rootBlockId, childCount);

  if (uploadBlocks.length > 0) {
    console.log(`📤 上传内容中... 共 ${uploadBlocks.length} 个 block`);
    await createDocumentBlocks(client, documentId, rootBlockId, uploadBlocks);
  } else {
    console.log('ℹ️  本地文档无可上传内容，已将远端文档清空');
  }

  console.log('');
  console.log('✅ 上传完成！');
  console.log(`📄 本地文件: ${absolutePath}`);
  console.log(`🆔 文档 ID: ${documentId}`);
}
