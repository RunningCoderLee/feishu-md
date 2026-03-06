import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import inquirer from 'inquirer';
import { createFeishuClient } from './api/client.js';
import { clearDocumentBlocks, createDocumentBlocks, getDocumentRootInfo } from './api/upload.js';
import { getWikiNodeInfo, getWikiNodeTree, type WikiTreeNode } from './api/wiki.js';
import {
  type FeishuConfig,
  loadConfig,
  loadLastOutputPath,
  saveConfig,
  saveLastOutputPath,
} from './config.js';
import { fetchDocumentMarkdown } from './converter/markdown.js';
import { parseDocumentId } from './parser/url-parser.js';
import { parseFrontMatter } from './uploader/front-matter.js';
import { parseMarkdownToBlocks } from './uploader/md-parser.js';
import { writeFile } from './utils/file.js';

/**
 * 确保凭证可用，首次运行时引导用户配置
 */
async function ensureConfig(): Promise<FeishuConfig> {
  const existing = loadConfig();
  if (existing) return existing;

  console.log('');
  console.log('🔐 首次运行，请配置飞书应用凭证');
  console.log('   获取方式: https://open.feishu.cn/app');
  console.log('');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'appId',
      message: '飞书 App ID:',
      validate: (input: string) => (input.trim() ? true : 'App ID 不能为空'),
    },
    {
      type: 'password',
      name: 'appSecret',
      message: '飞书 App Secret:',
      mask: '*',
      validate: (input: string) => (input.trim() ? true : 'App Secret 不能为空'),
    },
  ]);

  const config: FeishuConfig = {
    appId: answers.appId.trim(),
    appSecret: answers.appSecret.trim(),
  };

  saveConfig(config);
  return config;
}

/**
 * 将文件名中的非法字符替换为安全字符
 */
function sanitizeFileName(name: string): string {
  let sanitized = name.replace(/[/\\:*?"<>|]/g, '_');
  sanitized = sanitized.replace(/\.\./g, '_');
  sanitized = sanitized.trim().replace(/^\.+|\.+$/g, '');
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200);
  }
  return sanitized || 'untitled';
}

/**
 * 下载单个文档并保存
 */
async function downloadSingleDocument(
  client: ReturnType<typeof createFeishuClient>,
  documentId: string,
  title: string,
  outputPath: string,
): Promise<void> {
  const content = await fetchDocumentMarkdown(client, documentId);
  if (!content) {
    console.log(`   ⏭️  文档内容为空，跳过: ${title}`);
    return;
  }
  await writeFile(outputPath, content);
}

/**
 * 递归下载文档树
 *
 * 规则：
 * - 有内容 + 有子文档 → 创建文件夹，自身内容放 文件夹/同名.md
 * - 有内容 + 无子文档 → 直接保存为 .md 文件
 * - 无内容 + 有子文档 → 只创建文件夹
 * - 无内容 + 无子文档 → 跳过
 */
async function downloadTree(
  client: ReturnType<typeof createFeishuClient>,
  node: WikiTreeNode,
  basePath: string,
  counter: { current: number; total: number },
): Promise<void> {
  const safeName = sanitizeFileName(node.title);
  const hasChildren = node.children.length > 0;

  counter.current++;
  console.log(`[${counter.current}/${counter.total}] 下载: ${node.title}`);

  if (hasChildren) {
    // 有子文档 → 创建文件夹
    const folderPath = `${basePath}/${safeName}`;

    // 下载自身内容（可能为空）
    if (node.objType === 'docx' || node.objType === 'doc') {
      await downloadSingleDocument(
        client,
        node.objToken,
        node.title,
        `${folderPath}/${safeName}.md`,
      );
    }

    // 递归下载子文档
    for (const child of node.children) {
      await downloadTree(client, child, folderPath, counter);
    }
  } else {
    // 无子文档 → 直接保存为 .md
    if (node.objType === 'docx' || node.objType === 'doc') {
      await downloadSingleDocument(client, node.objToken, node.title, `${basePath}/${safeName}.md`);
    } else {
      console.log(`   ⏭️  不支持的文档类型 (${node.objType})，跳过: ${node.title}`);
    }
  }
}

/**
 * 统计树中的节点总数
 */
function countNodes(node: WikiTreeNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

/**
 * 检查是否是用户退出错误
 */
function isUserExit(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'ExitPromptError' || error.message.includes('force closed');
  }
  return false;
}

/**
 * 提示用户输入文档链接
 */
async function promptDocumentUrl(): Promise<string> {
  const { url } = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: '请输入飞书文档链接:',
      validate: (input: string) => {
        if (!input.trim()) return '文档链接不能为空';
        if (!input.includes('feishu.cn')) return '请输入有效的飞书文档链接';
        return true;
      },
    },
  ]);
  return url;
}

/**
 * 提示用户选择下载方式
 */
async function promptDownloadMode(): Promise<'single' | 'recursive' | 'flat'> {
  const { downloadMode } = await inquirer.prompt([
    {
      type: 'select',
      name: 'downloadMode',
      message: '请选择下载方式:',
      choices: [
        { name: '📄 仅下载当前文档', value: 'single' },
        { name: '📂 下载当前文档及其所有子文档（保持层级）', value: 'recursive' },
        { name: '📂 下载当前文档及其所有子文档（平铺到一个文件夹）', value: 'flat' },
      ],
    },
  ]);
  return downloadMode;
}

/**
 * 提示用户选择操作类型
 */
async function promptActionMode(): Promise<'download' | 'upload'> {
  const { actionMode } = await inquirer.prompt([
    {
      type: 'select',
      name: 'actionMode',
      message: '请选择操作:',
      choices: [
        { name: '📥 下载飞书文档到本地', value: 'download' },
        { name: '📤 上传本地 Markdown 到飞书', value: 'upload' },
      ],
    },
  ]);

  return actionMode;
}

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
 * 执行上传流程
 */
async function executeUploadFlow(client: ReturnType<typeof createFeishuClient>): Promise<void> {
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

    // wiki 链接需要先获取实际的文档 ID (obj_token)
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

  const { blocks: uploadBlocks } = parseMarkdownToBlocks(body);

  console.log('');
  console.log('🔍 获取远端文档信息...');
  const { rootBlockId, childCount } = await getDocumentRootInfo(client, documentId);

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

/**
 * 处理非 wiki 文档的下载
 */
async function handleNonWikiDocument(
  client: ReturnType<typeof createFeishuClient>,
  docToken: string,
): Promise<void> {
  console.log('   该文档不在知识库中，将作为单文档下载');
  const { outputPath } = await promptOutputPath('single');
  const filePath = `${outputPath}/${docToken}.md`;
  console.log('');
  console.log('📥 开始下载...');
  await downloadSingleDocument(client, docToken, docToken, filePath);
  console.log('');
  console.log('✅ 下载完成！');
  console.log(`📄 输出文件: ${resolve(filePath)}`);
}

/**
 * 执行单文档下载
 */
async function executeSingleDownload(
  client: ReturnType<typeof createFeishuClient>,
  nodeInfo: Awaited<ReturnType<typeof getWikiNodeInfo>>,
  outputPath: string,
): Promise<void> {
  const safeName = sanitizeFileName(nodeInfo.title);
  const filePath = `${outputPath}/${safeName}.md`;
  await downloadSingleDocument(client, nodeInfo.objToken, nodeInfo.title, filePath);
  console.log('');
  console.log('✅ 下载完成！');
  console.log(`📄 输出文件: ${resolve(filePath)}`);
}

/**
 * 执行递归下载
 */
async function executeRecursiveDownload(
  client: ReturnType<typeof createFeishuClient>,
  nodeInfo: Awaited<ReturnType<typeof getWikiNodeInfo>>,
  outputPath: string,
): Promise<void> {
  console.log('🌳 正在获取文档树结构...');
  const tree = await getWikiNodeTree(client, nodeInfo.spaceId, nodeInfo);
  const total = countNodes(tree);
  console.log(`   共发现 ${total} 个文档节点`);
  console.log('');

  const counter = { current: 0, total };
  await downloadTree(client, tree, outputPath, counter);

  console.log('');
  console.log(`✅ 下载完成！共 ${total} 个文档`);
  console.log(`📁 输出目录: ${resolve(outputPath)}`);
}

/**
 * 将文档树平铺为列表，每个节点附带父节点标题
 */
function flattenTree(
  node: WikiTreeNode,
  parentTitle?: string,
): Array<{ node: WikiTreeNode; parentTitle?: string }> {
  const result: Array<{ node: WikiTreeNode; parentTitle?: string }> = [{ node, parentTitle }];
  for (const child of node.children) {
    result.push(...flattenTree(child, node.title));
  }
  return result;
}

/**
 * 执行平铺下载（所有文档保存到同一目录）
 */
async function executeFlatDownload(
  client: ReturnType<typeof createFeishuClient>,
  nodeInfo: Awaited<ReturnType<typeof getWikiNodeInfo>>,
  outputPath: string,
): Promise<void> {
  console.log('🌳 正在获取文档树结构...');
  const tree = await getWikiNodeTree(client, nodeInfo.spaceId, nodeInfo);
  const total = countNodes(tree);
  console.log(`   共发现 ${total} 个文档节点`);
  console.log('');

  const items = flattenTree(tree);

  // 检测文件名冲突，冲突时加父文档前缀
  const nameCount = new Map<string, number>();
  for (const { node } of items) {
    const name = sanitizeFileName(node.title);
    nameCount.set(name, (nameCount.get(name) || 0) + 1);
  }

  let current = 0;
  const usedNames = new Set<string>();
  for (const { node, parentTitle } of items) {
    current++;
    console.log(`[${current}/${total}] 下载: ${node.title}`);

    if (node.objType !== 'docx' && node.objType !== 'doc') {
      console.log(`   ⏭️  不支持的文档类型 (${node.objType})，跳过: ${node.title}`);
      continue;
    }

    const safeName = sanitizeFileName(node.title);
    const isDuplicate = (nameCount.get(safeName) || 0) > 1;
    let fileName =
      isDuplicate && parentTitle
        ? `${sanitizeFileName(parentTitle)}-${safeName}.md`
        : `${safeName}.md`;

    if (usedNames.has(fileName)) {
      let i = 2;
      while (usedNames.has(`${fileName.slice(0, -3)}_${i}.md`)) i++;
      fileName = `${fileName.slice(0, -3)}_${i}.md`;
    }
    usedNames.add(fileName);

    await downloadSingleDocument(client, node.objToken, node.title, `${outputPath}/${fileName}`);
  }

  console.log('');
  console.log(`✅ 下载完成！共 ${total} 个文档`);
  console.log(`📁 输出目录: ${resolve(outputPath)}`);
}

/**
 * 交互式命令行界面
 */
export async function runInteractive() {
  console.log('');
  console.log('📝 飞书文档 Markdown 同步工具');
  console.log('');

  try {
    const config = await ensureConfig();
    const client = createFeishuClient(config.appId, config.appSecret);

    const actionMode = await promptActionMode();
    if (actionMode === 'upload') {
      await executeUploadFlow(client);
      return;
    }

    const url = await promptDocumentUrl();
    const docToken = parseDocumentId(url);

    console.log('');
    console.log('🔍 获取文档信息...');

    let nodeInfo: Awaited<ReturnType<typeof getWikiNodeInfo>>;
    try {
      nodeInfo = await getWikiNodeInfo(client, docToken);
    } catch {
      await handleNonWikiDocument(client, docToken);
      return;
    }

    console.log(`   文档标题: ${nodeInfo.title}`);
    console.log(`   文档类型: ${nodeInfo.objType}`);
    console.log(`   包含子文档: ${nodeInfo.hasChild ? '是' : '否'}`);

    const mode = nodeInfo.hasChild ? await promptDownloadMode() : 'single';
    const { outputPath } = await promptOutputPath(mode === 'single' ? 'single' : 'recursive');

    console.log('');
    console.log('📥 开始下载...');
    console.log('');

    if (mode === 'single') {
      await executeSingleDownload(client, nodeInfo, outputPath);
    } else if (mode === 'flat') {
      await executeFlatDownload(client, nodeInfo, outputPath);
    } else {
      await executeRecursiveDownload(client, nodeInfo, outputPath);
    }
  } catch (error) {
    if (isUserExit(error)) {
      console.log('\n👋 已退出');
      process.exit(0);
    }
    console.error('\n❌ 操作失败:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}

/**
 * 提示用户输入存储路径
 */
async function promptOutputPath(mode: 'single' | 'recursive'): Promise<{ outputPath: string }> {
  const cwd = process.cwd();
  const hint = mode === 'recursive' ? '子文档将按知识库层级创建文件夹' : '文档将保存到该目录下';
  const lastPath = loadLastOutputPath();

  console.log('');
  console.log(`📁 当前工作目录: ${cwd}`);
  console.log(`   ${hint}`);
  console.log('   支持相对路径 (如 ./docs) 和绝对路径 (如 /Users/xxx/docs)');

  const { outputPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'outputPath',
      message: '请输入存储路径:',
      default: lastPath || './docs',
      transformer: (input: string) => {
        if (input.trim()) {
          return `${input}  →  ${resolve(input)}`;
        }
        return input;
      },
    },
  ]);

  saveLastOutputPath(outputPath);
  return { outputPath };
}
