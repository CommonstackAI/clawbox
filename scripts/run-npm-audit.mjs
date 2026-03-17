#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const result = spawnSync(
  'npm',
  ['audit', '--audit-level=high', '--registry=https://registry.npmjs.org/'],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
)

process.exit(result.status ?? 1)
