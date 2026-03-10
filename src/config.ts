import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
}

const CONFIG_FILENAME = '.feishurc';

/**
 * 向上查找配置文件
 */
function findConfigUp(startDir: string, filename: string): string | null {
  let dir = startDir;
  while (dir !== dirname(dir)) {
    const configPath = join(dir, filename);
    if (existsSync(configPath)) {
      return configPath;
    }
    dir = dirname(dir);
  }
  return null;
}

/**
 * 获取配置文件路径（用户主目录）
 */
function getHomeConfigPath(): string {
  return join(homedir(), CONFIG_FILENAME);
}

/**
 * 从配置文件加载凭证
 *
 * 优先级: 项目目录向上查找 > 用户主目录
 */
export function loadConfig(): FeishuConfig | null {
  // 1. 从当前目录向上查找
  const foundConfig = findConfigUp(process.cwd(), CONFIG_FILENAME);
  if (foundConfig) {
    const config = parseConfigFile(foundConfig);
    if (config) {
      console.log(`📂 使用配置: ${foundConfig}`);
      return config;
    }
  }

  // 2. 用户主目录
  const homePath = getHomeConfigPath();
  if (existsSync(homePath)) {
    const config = parseConfigFile(homePath);
    if (config) {
      console.log(`📂 使用配置: ${homePath}`);
      return config;
    }
  }

  return null;
}

/**
 * 保存凭证到用户主目录
 */
export function saveConfig(config: FeishuConfig): void {
  const configPath = getHomeConfigPath();
  const existing = readRawConfig(configPath);
  writeFileSync(configPath, JSON.stringify({ ...existing, ...config }, null, 2), 'utf-8');
  console.log(`✅ 凭证已保存到 ${configPath}`);
}

/**
 * 读取上次使用的输出路径
 */
export function loadLastOutputPath(): string | null {
  const configPath = getHomeConfigPath();
  const raw = readRawConfig(configPath);
  return raw?.lastOutputPath || null;
}

/**
 * 保存本次使用的输出路径
 */
export function saveLastOutputPath(outputPath: string): void {
  const configPath = getHomeConfigPath();
  const existing = readRawConfig(configPath);
  writeFileSync(
    configPath,
    JSON.stringify({ ...existing, lastOutputPath: outputPath }, null, 2),
    'utf-8',
  );
}

/**
 * 读取上次下载的文档链接
 */
export function loadLastDocumentUrl(): { url: string; title: string } | null {
  const configPath = getHomeConfigPath();
  const raw = readRawConfig(configPath);
  if (raw?.lastDocumentUrl && raw?.lastDocumentTitle) {
    return { url: raw.lastDocumentUrl, title: raw.lastDocumentTitle };
  }
  return null;
}

/**
 * 保存本次下载的文档链接
 */
export function saveLastDocumentUrl(url: string, title: string): void {
  const configPath = getHomeConfigPath();
  const existing = readRawConfig(configPath);
  writeFileSync(
    configPath,
    JSON.stringify({ ...existing, lastDocumentUrl: url, lastDocumentTitle: title }, null, 2),
    'utf-8',
  );
}

/**
 * 读取配置文件原始 JSON
 */
function readRawConfig(path: string): Record<string, any> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * 解析配置文件
 */
function parseConfigFile(path: string): FeishuConfig | null {
  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed.appId && parsed.appSecret) {
      return { appId: parsed.appId, appSecret: parsed.appSecret };
    }
  } catch {
    // 忽略解析错误
  }
  return null;
}

/**
 * 获取当前生效的配置信息（含路径）
 */
export function getConfigInfo(): { config: FeishuConfig | null; path: string } {
  const foundConfig = findConfigUp(process.cwd(), CONFIG_FILENAME);
  if (foundConfig) {
    const config = parseConfigFile(foundConfig);
    if (config) return { config, path: foundConfig };
  }

  const homePath = getHomeConfigPath();
  if (existsSync(homePath)) {
    const config = parseConfigFile(homePath);
    if (config) return { config, path: homePath };
  }

  return { config: null, path: getHomeConfigPath() };
}
