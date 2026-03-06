#!/usr/bin/env node

import { program } from 'commander';
import pkg from '../package.json' with { type: 'json' };
import { runInteractive } from './interactive/index.js';
import { enableDebug } from './utils/debug.js';

program
  .name('feishu-md')
  .description('将飞书文档转换为 Markdown 文件')
  .version(pkg.version)
  .option('--debug', '启用调试模式，报错时保留日志到临时目录')
  .action(async (options: { debug?: boolean }) => {
    if (options.debug) {
      enableDebug();
    }
    await runInteractive();
  });

program.parse();
