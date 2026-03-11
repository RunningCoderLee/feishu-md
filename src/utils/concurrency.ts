export const DOWNLOAD_CONCURRENCY = 2;

/**
 * 以有限并发执行异步任务列表（worker-pool 模式）
 *
 * 实际 HTTP 限速由 FeishuApp 各自的 RequestQueue 负责，
 * 此函数仅控制同时运行的任务数，防止内存过度占用。
 */
export async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
}
