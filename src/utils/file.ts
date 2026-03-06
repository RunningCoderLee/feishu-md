import { writeFile as fsWriteFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * 写入文件到本地（自动创建目录）
 *
 * @param path 文件路径 (相对或绝对路径)
 * @param content 文件内容
 */
export async function writeFile(path: string, content: string): Promise<void> {
  const absolutePath = resolve(path);
  const dir = dirname(absolutePath);

  // 自动创建目录
  await mkdir(dir, { recursive: true });

  try {
    await fsWriteFile(absolutePath, content, 'utf-8');
  } catch (error) {
    if (error instanceof Error) {
      // 权限错误
      if (error.message.includes('EACCES')) {
        throw new Error(`无写入权限: ${absolutePath}`);
      }
      // 磁盘空间不足
      if (error.message.includes('ENOSPC')) {
        throw new Error('磁盘空间不足');
      }
    }
    throw error;
  }
}
