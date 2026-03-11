import inquirer from 'inquirer';
import {
  type AppCredential,
  type FeishuConfig,
  getConfigInfo,
  loadConfig,
  saveConfig,
  saveExtraApps,
} from '../config.js';

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

// ============ 额外应用管理 ============

/**
 * 管理额外应用的子流程
 */
async function executeManageExtraAppsFlow(extraApps: AppCredential[]): Promise<void> {
  console.log('');
  if (extraApps.length === 0) {
    console.log('   当前没有额外应用');
  } else {
    console.log('   额外应用列表:');
    for (let i = 0; i < extraApps.length; i++) {
      console.log(`   ${i + 1}. ${extraApps[i]!.appId}`);
    }
  }
  console.log('');

  const choices = [
    { name: '➕ 添加额外应用', value: 'add' as const },
    ...(extraApps.length > 0 ? [{ name: '➖ 删除额外应用', value: 'remove' as const }] : []),
    { name: '↩️  返回', value: 'back' as const },
  ];

  const { action } = await inquirer.prompt([
    { type: 'select', name: 'action', message: '请选择操作:', choices },
  ]);

  if (action === 'back') return;

  if (action === 'add') {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'appId',
        message: '额外应用 App ID:',
        validate: (input: string) => {
          if (!input.trim()) return 'App ID 不能为空';
          if (extraApps.some((a) => a.appId === input.trim())) return '该 App ID 已存在';
          return true;
        },
      },
      {
        type: 'password',
        name: 'appSecret',
        message: '额外应用 App Secret:',
        mask: '*',
        validate: (input: string) => (input.trim() ? true : 'App Secret 不能为空'),
      },
    ]);

    const updated = [
      ...extraApps,
      { appId: answers.appId.trim(), appSecret: answers.appSecret.trim() },
    ];
    saveExtraApps(updated);
    console.log(`✅ 已添加额外应用 ${answers.appId.trim()}`);
    return;
  }

  // remove
  const { indices } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'indices',
      message: '选择要删除的应用:',
      choices: extraApps.map((a, i) => ({ name: a.appId, value: i })),
    },
  ]);

  if (indices.length === 0) return;
  const updated = extraApps.filter((_: AppCredential, i: number) => !indices.includes(i));
  saveExtraApps(updated);
  console.log(`✅ 已删除 ${indices.length} 个额外应用`);
}

// ============ 配置主流程 ============

/**
 * 配置管理流程
 */
export async function executeConfigFlow(onBack: () => Promise<void>): Promise<void> {
  const { config, path } = getConfigInfo();

  console.log('');
  console.log('⚙️  当前配置');
  console.log(`   配置文件: ${path}`);

  if (config) {
    console.log(`   主应用 ID:     ${config.appId}`);
    console.log(`   主应用 Secret: ${maskSecret(config.appSecret)}`);
    const extraCount = config.extraApps?.length ?? 0;
    console.log(`   额外应用: ${extraCount > 0 ? `${extraCount} 个` : '无'}`);
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
        { name: '✏️  修改主应用配置', value: 'edit' },
        { name: '📱 管理额外应用', value: 'extra' },
        { name: '↩️  返回主菜单', value: 'back' },
      ],
    },
  ]);

  if (action === 'back') {
    await onBack();
    return;
  }

  if (action === 'extra') {
    await executeManageExtraAppsFlow(config?.extraApps ?? []);
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
