import * as lark from '@larksuiteoapi/node-sdk';
import { extractApiErrorInfo } from '../utils/api-helpers.js';

// ============ 限速与重试 ============

const REQUEST_INTERVAL_MS = 300; // ~3.3 次/秒
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/**
 * FIFO 请求队列 — 每隔 REQUEST_INTERVAL_MS 释放一个 slot。
 * 每个 FeishuApp 实例持有独立的队列，实现多应用并行限速。
 */
class RequestQueue {
  private queue: Array<() => void> = [];
  private processing = false;
  private lastDispatchTime = 0;

  enqueue(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      if (!this.processing) this.process();
    });
  }

  private process(): void {
    this.processing = true;
    const next = this.queue.shift();
    if (!next) {
      this.processing = false;
      return;
    }
    const elapsed = Date.now() - this.lastDispatchTime;
    const delay = Math.max(0, REQUEST_INTERVAL_MS - elapsed);
    setTimeout(() => {
      this.lastDispatchTime = Date.now();
      next();
      this.process();
    }, delay);
  }
}

function is429Error(error: unknown): boolean {
  const info = extractApiErrorInfo(error);
  return info?.httpStatus === 429;
}

// ============ FeishuApp ============

/**
 * 飞书应用实例 — 封装 SDK client 和独立的限速队列
 */
export interface FeishuApp {
  readonly appId: string;
  readonly client: lark.Client;
  withRetry<T>(fn: () => Promise<T>): Promise<T>;
}

export function createFeishuApp(appId: string, appSecret: string): FeishuApp {
  const client = new lark.Client({ appId, appSecret, disableTokenCache: false });
  const queue = new RequestQueue();

  return {
    appId,
    client,
    async withRetry<T>(fn: () => Promise<T>): Promise<T> {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          await queue.enqueue();
          return await fn();
        } catch (error) {
          if (is429Error(error) && attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }
      }
      throw new Error('重试次数已耗尽');
    },
  };
}

// ============ AppPool ============

/**
 * 应用池 — 管理主应用和额外应用，提供 round-robin 分配
 */
export interface AppPool {
  readonly primary: FeishuApp;
  readonly all: ReadonlyArray<FeishuApp>;
  /** round-robin 返回下一个应用 */
  next(): FeishuApp;
}

export function createAppPool(primary: FeishuApp, extras: FeishuApp[]): AppPool {
  const all = [primary, ...extras];
  let cursor = 0;

  return {
    primary,
    all,
    next() {
      const app = all[cursor % all.length]!;
      cursor++;
      return app;
    },
  };
}
