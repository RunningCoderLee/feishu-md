/**
 * 零依赖 ANSI 进度条。
 * 所有输出统一写 stderr，每次 tick/skip 合并为单次 write 避免渲染撕裂。
 * 非 TTY 环境自动降级为逐行日志。
 */
export class ProgressBar {
  private current = 0;
  private readonly width = 30;
  private readonly isTTY: boolean;
  private readonly startTime: number;

  constructor(private readonly total: number) {
    this.isTTY = process.stderr.isTTY === true && total > 1;
    this.startTime = Date.now();
    if (this.isTTY) this.writeBar();
  }

  /** 完成一个文件，打印日志并更新进度条 */
  tick(title: string): void {
    this.current = Math.min(this.current + 1, this.total);
    const line = `  \x1b[32m✓\x1b[0m [${this.current}/${this.total}] ${title}\n`;
    if (this.isTTY) {
      process.stderr.write(`\r\x1b[K${line}${this.barString()}`);
    } else {
      process.stderr.write(line);
    }
  }

  /** 跳过一个文件 */
  skip(title: string, reason: string): void {
    this.current = Math.min(this.current + 1, this.total);
    const line = `  \x1b[90m⏭ [${this.current}/${this.total}] ${title} (${reason})\x1b[0m\n`;
    if (this.isTTY) {
      process.stderr.write(`\r\x1b[K${line}${this.barString()}`);
    } else {
      process.stderr.write(line);
    }
  }

  done(summary?: string): void {
    if (this.isTTY) process.stderr.write('\r\x1b[K');
    if (summary) process.stderr.write(`${summary}\n`);
  }

  private writeBar(): void {
    process.stderr.write(this.barString());
  }

  private barString(): string {
    const pct = this.current / this.total;
    const filled = Math.round(this.width * pct);
    const empty = this.width - filled;
    const bar = `\x1b[32m${'━'.repeat(filled)}\x1b[90m${'━'.repeat(empty)}\x1b[0m`;
    const pctStr = `${Math.round(pct * 100)}%`.padStart(4);

    const elapsed = (Date.now() - this.startTime) / 1000;
    const timeStr = elapsed >= 1 ? ` ${elapsed.toFixed(1)}s` : '';

    return `\r\x1b[K  ${bar} ${pctStr} ${this.current}/${this.total}${timeStr}`;
  }
}
