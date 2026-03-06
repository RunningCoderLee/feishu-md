import inquirer from 'inquirer';
import { createFeishuClient } from '../api/client.js';
import { getDebugDir, isDebug } from '../utils/debug.js';
import { ensureConfig, executeConfigFlow } from './config.js';
import { executeDownloadFlow } from './download.js';
import { executeUploadFlow } from './upload.js';

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
 * 提示用户选择操作类型
 */
async function promptActionMode(): Promise<'download' | 'upload' | 'config'> {
  const { actionMode } = await inquirer.prompt([
    {
      type: 'select',
      name: 'actionMode',
      message: '请选择操作:',
      choices: [
        { name: '📥 下载飞书文档到本地', value: 'download' },
        { name: '📤 上传本地 Markdown 到飞书', value: 'upload' },
        { name: '⚙️  查看/修改配置', value: 'config' },
      ],
    },
  ]);

  return actionMode;
}

/**
 * 交互式命令行界面
 */
export async function runInteractive() {
  console.log('');
  console.log('📝 飞书文档 Markdown 同步工具');
  console.log('');

  try {
    const actionMode = await promptActionMode();
    if (actionMode === 'config') {
      await executeConfigFlow(() => runInteractive());
      return;
    }

    const config = await ensureConfig();
    const client = createFeishuClient(config.appId, config.appSecret);

    if (actionMode === 'upload') {
      await executeUploadFlow(client);
      return;
    }

    await executeDownloadFlow(client);
  } catch (error) {
    if (isUserExit(error)) {
      console.log('\n👋 已退出');
      process.exit(0);
    }
    console.error('\n❌ 操作失败:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else if (Array.isArray(error)) {
      // 飞书 SDK 可能抛出嵌套数组格式的错误
      try {
        console.error(JSON.stringify(error, null, 2));
      } catch {
        console.error(`   ${String(error)}`);
      }
    } else {
      console.error(`   ${String(error)}`);
    }
    if (isDebug()) {
      console.error(`\n📂 调试日志目录: ${getDebugDir()}`);
    }
    process.exit(1);
  }
}
