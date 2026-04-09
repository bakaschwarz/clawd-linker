#!/usr/bin/env node

import { program } from 'commander';
import { initCommand } from '../src/commands/init.js';
import { newCommand } from '../src/commands/new.js';
import { manageCommand } from '../src/commands/manage.js';
import { listCommand } from '../src/commands/list.js';
import { syncCommand } from '../src/commands/sync.js';
import packageJson from '../package.json' with { type: 'json' };

program
  .name('cla-linker')
  .description('Manage reusable file packages across projects via symlinks')
  .version(packageJson.version);

program
  .command('init')
  .description('Create and register a package repository')
  .action(initCommand);

program
  .command('new <name>')
  .description('Scaffold a new package in the repository')
  .action(newCommand);

program
  .command('manage')
  .alias('m')
  .description('Manage installed packages for this project')
  .option('--dry-run', 'Preview changes without making any filesystem changes')
  .option('-y, --yes', 'Skip confirmation prompts (headless/scripted use)')
  .action(manageCommand);

program
  .command('list')
  .alias('ls')
  .description('Show installed packages for this project')
  .action(listCommand);

program
  .command('sync')
  .alias('s')
  .description('Update installed packages with the latest content from the central repo')
  .option('-g, --global', 'Sync all registered projects (default: current directory only)')
  .option('--watch', 'Watch for changes and sync automatically')
  .action(syncCommand);

program.parse();
