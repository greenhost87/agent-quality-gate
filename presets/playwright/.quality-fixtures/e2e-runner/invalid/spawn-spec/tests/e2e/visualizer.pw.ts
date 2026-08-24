import { test } from '@playwright/test';
import { spawn } from 'node:child_process';

test('starts the visualizer from the spec', async () => {
  spawn('node', ['server.js']);
});
