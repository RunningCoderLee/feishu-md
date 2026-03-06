#!/usr/bin/env node

import { program } from 'commander';
import pkg from '../package.json' with { type: 'json' };
import { runInteractive } from './interactive/index.js';

program
  .name('feishu-md')
  .description('将飞书文档转换为 Markdown 文件')
  .version(pkg.version)
  .action(async () => {
    await runInteractive();
  });

program.parse();
