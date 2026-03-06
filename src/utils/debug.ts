import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let debugEnabled = false;
let debugDir: string | null = null;

/**
 * 启用调试模式，初始化临时目录
 */
export function enableDebug(): void {
  debugEnabled = true;
  debugDir = join(tmpdir(), `feishu-md-debug-${Date.now()}`);
  mkdirSync(debugDir, { recursive: true });
  console.log(`🔍 调试模式已启用，日志目录: ${debugDir}`);
}

export function isDebug(): boolean {
  return debugEnabled;
}

/**
 * 将调试数据写入临时目录并打印路径
 */
export function dumpDebugJson(filename: string, data: unknown): void {
  if (!debugEnabled || !debugDir) return;
  const filePath = join(debugDir, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`🔍 [DEBUG] ${filename} → ${filePath}`);
}

/**
 * 获取调试目录路径（用于错误提示）
 */
export function getDebugDir(): string | null {
  return debugDir;
}
