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
 * 优先级: 项目目录向上查找 > 用户主目录 > 环境变量
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

  // 3. 环境变量
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (appId && appSecret) {
    console.log('📂 使用环境变量配置');
    return { appId, appSecret };
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
