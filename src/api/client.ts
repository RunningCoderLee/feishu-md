import * as lark from '@larksuiteoapi/node-sdk';

/**
 * 创建飞书 SDK 客户端
 *
 * @param appId 飞书应用 ID
 * @param appSecret 飞书应用 Secret
 * @returns 飞书客户端实例
 */
export function createFeishuClient(appId: string, appSecret: string) {
  return new lark.Client({
    appId,
    appSecret,
    // SDK 自动管理 token 的获取与刷新
    disableTokenCache: false,
  });
}
