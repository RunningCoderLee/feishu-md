import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import inquirer from 'inquirer';
import type { AppPool, FeishuApp } from '../api/app.js';
import {
  clearDocumentBlocks,
  createDocumentBlocks,
  getDocumentRootInfo,
  updateDocumentTitle,
} from '../api/upload.js';
import { getWikiNodeInfo } from '../api/wiki.js';
import { parseDocumentId } from '../parser/url-parser.js';
import type { FeishuUploadBlock } from '../uploader/md-parser.js';
import { parseMarkdownToBlocks } from '../uploader/md-parser.js';
import { withConcurrency } from '../utils/concurrency.js';
import { dumpDebugJson, isDebug } from '../utils/debug.js';
import { parseFrontMatter } from '../utils/front-matter.js';
import { stripShellEscapes } from '../utils/path.js';
import { ProgressBar } from '../utils/progress.js';

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

  return stripShellEscapes(markdownPath);
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

// ============ 文档 ID 解析 ============

/**
 * 从 front-matter 或用户输入解析文档 ID
 */
async function resolveDocumentId(
  app: FeishuApp,
  frontMatter: Record<string, unknown>,
): Promise<string> {
  const docId = typeof frontMatter.feishu_doc_id === 'string' ? frontMatter.feishu_doc_id : null;
  if (docId) return docId;

  console.log('⚠️  未从 front-matter 读取到 feishu_doc_id');
  const url = await promptUploadDocumentUrl();
  const token = parseDocumentId(url);

  if (url.includes('/wiki/')) {
    console.log('');
    console.log('🔍 从知识库节点获取文档信息...');
    const nodeInfo = await getWikiNodeInfo(app, token);
    if (nodeInfo.objType !== 'docx' && nodeInfo.objType !== 'doc') {
      throw new Error(`不支持的文档类型: ${nodeInfo.objType}，仅支持 docx 类型的文档`);
    }
    console.log(`   文档标题: ${nodeInfo.title}`);
    return nodeInfo.objToken;
  }
  return token;
}

// ============ 单文件上传核心 ============

/**
 * 上传单个文件到飞书文档（供单文件和批量模式共用）
 */
async function uploadSingleDocument(
  app: FeishuApp,
  documentId: string,
  uploadBlocks: FeishuUploadBlock[],
  localTitle: string | null,
  fileBaseName: string,
): Promise<void> {
  const {
    rootBlockId,
    childCount,
    title: remoteTitle,
  } = await getDocumentRootInfo(app, documentId);

  const finalTitle = await resolveTitle(localTitle, fileBaseName, remoteTitle);
  if (finalTitle && finalTitle !== remoteTitle) {
    console.log(`📝 更新文档标题: ${finalTitle}`);
    await updateDocumentTitle(app, documentId, rootBlockId, finalTitle);
  }

  await clearDocumentBlocks(app, documentId, rootBlockId, childCount);

  if (uploadBlocks.length > 0) {
    await createDocumentBlocks(app, documentId, rootBlockId, uploadBlocks);
  }
}

// ============ 主入口：单文件上传 ============

/**
 * 执行单文件上传流程
 */
export async function executeUploadFlow(pool: AppPool): Promise<void> {
  const markdownPath = await promptMarkdownPath();
  const absolutePath = resolve(markdownPath);

  let content: string;
  try {
    content = readFileSync(absolutePath, 'utf-8');
  } catch {
    throw new Error(`读取文件失败: ${absolutePath}`);
  }

  const { frontMatter, body } = parseFrontMatter(content);
  const documentId = await resolveDocumentId(pool.primary, frontMatter);

  const { blocks: uploadBlocks, title: localTitle } = parseMarkdownToBlocks(body);

  if (isDebug()) {
    dumpDebugJson(`upload-blocks-${documentId}.json`, uploadBlocks);
  }

  const fileBaseName = absolutePath.replace(/^.*[\\/]/, '').replace(/\.md$/i, '');

  console.log('');
  console.log('🔍 获取远端文档信息...');
  await uploadSingleDocument(pool.primary, documentId, uploadBlocks, localTitle, fileBaseName);

  console.log('');
  console.log('✅ 上传完成！');
  console.log(`📄 本地文件: ${absolutePath}`);
  console.log(`🆔 文档 ID: ${documentId}`);
}

// ============ 批量上传 ============

const UPLOAD_CONCURRENCY = 2;

/**
 * 递归扫描目录下所有 .md 文件
 */
function scanMarkdownFiles(dir: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

/**
 * 提示用户输入目录路径
 */
async function promptDirectoryPath(): Promise<string> {
  const { dirPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'dirPath',
      message: '请输入 Markdown 文件所在目录:',
      validate: (input: string) => {
        if (!input.trim()) return '目录路径不能为空';
        try {
          const stat = statSync(resolve(stripShellEscapes(input)));
          if (!stat.isDirectory()) return '路径不是一个目录';
          return true;
        } catch {
          return '目录不存在';
        }
      },
      transformer: (input: string) => {
        const stripped = stripShellEscapes(input.trim());
        if (stripped) {
          return `${input}  →  ${resolve(stripped)}`;
        }
        return input;
      },
    },
  ]);

  return resolve(stripShellEscapes(dirPath));
}

/**
 * 提示用户从扫描到的文件列表中选择要上传的文件
 */
async function promptSelectFiles(files: string[], baseDir: string): Promise<string[]> {
  const choices = files.map((f) => {
    const rel = relative(baseDir, f);
    const content = readFileSync(f, 'utf-8');
    const { frontMatter } = parseFrontMatter(content);
    const hasDocId = typeof frontMatter.feishu_doc_id === 'string';
    const tag = hasDocId ? '✅' : '⚠️ ';
    return {
      name: `${tag} ${rel}`,
      value: f,
      checked: true,
    };
  });

  console.log('');
  console.log('📋 扫描结果（✅ = 已有 feishu_doc_id，⚠️  = 需手动输入目标文档）:');

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: '请选择要上传的文件:',
      choices,
      validate: (input: string[]) => (input.length > 0 ? true : '请至少选择一个文件'),
    },
  ]);

  return selected;
}

/**
 * 批量上传的准备结果（阶段一产出，阶段二消费）
 */
interface BatchUploadItem {
  absolutePath: string;
  documentId: string;
  rootBlockId: string;
  childCount: number;
  uploadBlocks: FeishuUploadBlock[];
  finalTitle: string | null;
  remoteTitle: string;
}

/**
 * 执行批量上传流程
 */
export async function executeBatchUploadFlow(pool: AppPool): Promise<void> {
  const dirPath = await promptDirectoryPath();
  const allFiles = scanMarkdownFiles(dirPath);

  if (allFiles.length === 0) {
    console.log('');
    console.log('ℹ️  该目录下没有找到 .md 文件');
    return;
  }

  console.log(`   找到 ${allFiles.length} 个 .md 文件`);

  const selectedFiles = await promptSelectFiles(allFiles, dirPath);
  console.log('');
  console.log(`📝 已选择 ${selectedFiles.length} 个文件，开始准备...`);

  // 阶段一：顺序准备（解析文件、解析文档 ID、解析标题）— 使用主应用
  const items: BatchUploadItem[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const filePath of selectedFiles) {
    const rel = relative(dirPath, filePath);
    console.log('');
    console.log(`── 处理: ${rel}`);

    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      skipped.push({ path: rel, reason: '读取失败' });
      console.log('   ⏭️  读取文件失败，跳过');
      continue;
    }

    const { frontMatter, body } = parseFrontMatter(content);

    let documentId: string;
    try {
      documentId = await resolveDocumentId(pool.primary, frontMatter);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      skipped.push({ path: rel, reason: msg });
      console.log(`   ⏭️  ${msg}，跳过`);
      continue;
    }

    const { blocks: uploadBlocks, title: localTitle } = parseMarkdownToBlocks(body);
    const fileBaseName = basename(filePath, '.md');

    if (isDebug()) {
      dumpDebugJson(`upload-blocks-${documentId}.json`, uploadBlocks);
    }

    // 获取远端文档信息并解析标题（需交互，必须在顺序阶段完成）
    console.log('   🔍 获取远端文档信息...');
    const {
      rootBlockId,
      childCount,
      title: remoteTitle,
    } = await getDocumentRootInfo(pool.primary, documentId);

    const finalTitle = await resolveTitle(localTitle, fileBaseName, remoteTitle);

    items.push({
      absolutePath: filePath,
      documentId,
      rootBlockId,
      childCount,
      uploadBlocks,
      finalTitle,
      remoteTitle,
    });
  }

  if (items.length === 0) {
    console.log('');
    console.log('ℹ️  没有可上传的文件');
    return;
  }

  // 阶段二：并发上传 — round-robin 分配应用
  console.log('');
  console.log(`📤 开始上传 ${items.length} 个文件...`);
  if (pool.all.length > 1) {
    console.log(`   使用 ${pool.all.length} 个应用并行上传`);
  }
  console.log('');

  const startTime = Date.now();
  const bar = new ProgressBar(items.length);
  const errors: Array<{ path: string; error: string }> = [];

  const concurrency = UPLOAD_CONCURRENCY * pool.all.length;
  await withConcurrency(items, concurrency, async (item) => {
    const app = pool.next();
    const rel = relative(dirPath, item.absolutePath);
    try {
      if (item.finalTitle && item.finalTitle !== item.remoteTitle) {
        await updateDocumentTitle(app, item.documentId, item.rootBlockId, item.finalTitle);
      }
      await clearDocumentBlocks(app, item.documentId, item.rootBlockId, item.childCount);
      if (item.uploadBlocks.length > 0) {
        await createDocumentBlocks(app, item.documentId, item.rootBlockId, item.uploadBlocks);
      }
      bar.tick(rel);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push({ path: rel, error: msg });
      bar.skip(rel, '上传失败');
    }
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  bar.done();

  // 汇总
  console.log('');
  console.log(`✅ 批量上传完成！耗时 ${elapsed}s`);
  console.log(`   成功: ${items.length - errors.length}/${items.length}`);

  if (skipped.length > 0) {
    console.log(`   跳过: ${skipped.length} 个文件`);
    for (const { path, reason } of skipped) {
      console.log(`     ⏭️  ${path} (${reason})`);
    }
  }

  if (errors.length > 0) {
    console.log(`   失败: ${errors.length} 个文件`);
    for (const { path, error } of errors) {
      console.log(`     ❌ ${path}: ${error}`);
    }
  }
}
