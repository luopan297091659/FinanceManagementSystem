const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pm2Command = process.platform === 'win32' ? 'pm2.cmd' : 'pm2';

const steps = [
  {
    label: 'Install locked backend dependencies',
    command: npmCommand,
    args: ['--prefix', 'backend', 'ci', '--include=dev', '--no-audit', '--no-fund'],
  },
  {
    label: 'Generate Prisma Client',
    command: npmCommand,
    args: ['run', 'backend:prisma:generate'],
  },
  {
    label: 'Apply production database migrations',
    command: npmCommand,
    args: ['run', 'backend:prisma:deploy'],
  },
  {
    label: 'Build frontend assets served by the backend',
    command: npmCommand,
    args: ['run', 'build'],
  },
  {
    label: 'Build backend',
    command: npmCommand,
    args: ['run', 'backend:build'],
  },
  {
    label: 'Verify image-to-PDF runtime dependency',
    command: npmCommand,
    args: ['--prefix', 'backend', 'ls', 'pdf-lib', '--omit=dev'],
  },
  {
    label: 'Restart PM2 backend',
    command: pm2Command,
    args: ['restart', 'finance-management', '--update-env'],
  },
];

for (const step of steps) {
  console.log(`\n[deploy:backend] ${step.label}`);
  const result = spawnSync(step.command, step.args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error(`[deploy:backend] ${step.label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[deploy:backend] ${step.label} exited with code ${result.status}. PM2 was not restarted.`);
    process.exit(result.status || 1);
  }
}

console.log('\n[deploy:backend] Deployment completed successfully.');
