import inquirer from 'inquirer';
import { type FeishuConfig, getConfigInfo, loadConfig, saveConfig } from '../config.js';

/**
 * 确保凭证可用，首次运行时引导用户配置
 */
export async function ensureConfig(): Promise<FeishuConfig> {
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
 * 脱敏显示密钥（保留前 4 位和后 4 位）
 */
function maskSecret(secret: string): string {
  if (secret.length <= 8) return '****';
  return `${secret.slice(0, 4)}${'*'.repeat(secret.length - 8)}${secret.slice(-4)}`;
}

/**
 * 配置管理流程
 */
export async function executeConfigFlow(onBack: () => Promise<void>): Promise<void> {
  const { config, path } = getConfigInfo();

  console.log('');
  console.log('⚙️  当前配置');
  console.log(`   配置文件: ${path}`);

  if (config) {
    console.log(`   App ID:     ${config.appId}`);
    console.log(`   App Secret: ${maskSecret(config.appSecret)}`);
  } else {
    console.log('   状态: 未配置');
  }
  console.log('');

  const { action } = await inquirer.prompt([
    {
      type: 'select',
      name: 'action',
      message: '请选择操作:',
      choices: [
        { name: '✏️  修改配置', value: 'edit' },
        { name: '↩️  返回主菜单', value: 'back' },
      ],
    },
  ]);

  if (action === 'back') {
    await onBack();
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'appId',
      message: '飞书 App ID:',
      default: config?.appId,
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

  saveConfig({ appId: answers.appId.trim(), appSecret: answers.appSecret.trim() });
}
