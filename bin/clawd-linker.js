#!/usr/bin/env node

import { program } from 'commander';
import { initCommand } from '../src/commands/init.js';
import { newCommand } from '../src/commands/new.js';
import { manageCommand } from '../src/commands/manage.js';
import { listCommand } from '../src/commands/list.js';

program
  .name('clawd-linker')
  .description('Manage reusable file packages across projects via symlinks')
  .version('0.1.0');

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

program.parse();
