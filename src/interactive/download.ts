import { resolve } from 'node:path';
import inquirer from 'inquirer';
import type { createFeishuClient } from '../api/client.js';
import { getWikiNodeInfo, getWikiNodeTree, type WikiTreeNode } from '../api/wiki.js';
import { loadLastOutputPath, saveLastOutputPath } from '../config.js';
import { fetchDocumentMarkdown } from '../converter/markdown.js';
import { parseDocumentId } from '../parser/url-parser.js';
import { writeFile } from '../utils/file.js';

// ============ 工具函数 ============

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

// ============ 下载核心 ============

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
    const folderPath = `${basePath}/${safeName}`;

    if (node.objType === 'docx' || node.objType === 'doc') {
      await downloadSingleDocument(
        client,
        node.objToken,
        node.title,
        `${folderPath}/${safeName}.md`,
      );
    }

    for (const child of node.children) {
      await downloadTree(client, child, folderPath, counter);
    }
  } else {
    if (node.objType === 'docx' || node.objType === 'doc') {
      await downloadSingleDocument(client, node.objToken, node.title, `${basePath}/${safeName}.md`);
    } else {
      console.log(`   ⏭️  不支持的文档类型 (${node.objType})，跳过: ${node.title}`);
    }
  }
}

// ============ Prompt ============

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
 * 提示用户输入存储路径
 */
async function promptOutputPath(mode: 'single' | 'recursive'): Promise<string> {
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
  return outputPath;
}

// ============ 下载子流程 ============

/**
 * 处理非 wiki 文档的下载
 */
async function handleNonWikiDocument(
  client: ReturnType<typeof createFeishuClient>,
  docToken: string,
): Promise<void> {
  console.log('   该文档不在知识库中，将作为单文档下载');
  const outputPath = await promptOutputPath('single');
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

// ============ 主入口 ============

/**
 * 执行下载流程
 */
export async function executeDownloadFlow(
  client: ReturnType<typeof createFeishuClient>,
): Promise<void> {
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
  const outputPath = await promptOutputPath(mode === 'single' ? 'single' : 'recursive');

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
}
