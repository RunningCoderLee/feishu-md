// ============ API 错误处理 ============

/**
 * 从飞书 SDK 错误中提取结构化信息
 *
 * 错误可能是以下几种形式：
 * - AxiosError 对象: { code: "ERR_BAD_REQUEST", response: { status, data: { code, msg, log_id } } }
 * - 嵌套数组 [[axiosError, feishuResponse]]
 * - 飞书 API 响应对象: { code: 1770001, msg, log_id }
 */
export function extractApiErrorInfo(error: unknown): {
  httpStatus?: number;
  code?: number | string;
  msg?: string;
  logId?: string;
  troubleshooter?: string;
} | null {
  // 直接对象形式（通常是 AxiosError 或飞书响应）
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const e = error as any;
    // AxiosError: 飞书错误详情在 response.data 里
    const data = e.response?.data;
    if (data && typeof data.code === 'number') {
      return {
        httpStatus: e.response?.status,
        code: data.code,
        msg: data.msg,
        logId: data.log_id,
        troubleshooter: data.troubleshooter,
      };
    }
    return {
      httpStatus: e.response?.status,
      code: e.code,
      msg: e.msg,
      logId: e.log_id,
      troubleshooter: e.troubleshooter,
    };
  }
  // 嵌套数组形式 [[item1, item2, ...]]
  if (Array.isArray(error)) {
    let httpStatus: number | undefined;

    for (const inner of error) {
      if (!Array.isArray(inner)) continue;
      for (const item of inner) {
        if (!item || typeof item !== 'object') continue;
        if (item.response?.status) httpStatus = item.response.status;
        // 优先返回飞书 API 响应（数字 code）
        if (typeof item.code === 'number' && item.code !== 0) {
          return {
            httpStatus: httpStatus || item.response?.status,
            code: item.code,
            msg: item.msg,
            logId: item.log_id,
            troubleshooter: item.troubleshooter,
          };
        }
        // AxiosError 中的 response.data
        const data = item.response?.data;
        if (data && typeof data.code === 'number') {
          return {
            httpStatus: item.response?.status,
            code: data.code,
            msg: data.msg,
            logId: data.log_id,
            troubleshooter: data.troubleshooter,
          };
        }
      }
    }

    if (httpStatus) return { httpStatus };
  }
  return null;
}

export function formatApiError(error: unknown, context: string): Error {
  const info = extractApiErrorInfo(error);
  if (info) {
    const parts = [context];
    if (info.httpStatus) parts.push(`HTTP ${info.httpStatus}`);
    if (info.code) parts.push(`code: ${info.code}`);
    if (info.msg) parts.push(info.msg);
    if (info.logId) parts.push(`log_id: ${info.logId}`);
    if (info.troubleshooter) parts.push(`排查: ${info.troubleshooter}`);
    return new Error(parts.join(' | '));
  }
  if (error instanceof Error) return new Error(`${context}: ${error.message}`);
  return new Error(`${context}: ${String(error)}`);
}
