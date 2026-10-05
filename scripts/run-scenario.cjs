const { fork, spawn } = require('node:child_process');
const { mkdirSync, rmSync } = require('node:fs');
const { resolve } = require('node:path');

const rootDirectory = resolve(__dirname, '..');
const coverageDirectory = resolve(rootDirectory, 'output/v8');
// Descarta somente medições temporárias anteriores, nunca dados da API original.
rmSync(coverageDirectory, { recursive: true, force: true });
mkdirSync(coverageDirectory, { recursive: true });
const apiDirectory = resolve(__dirname, '../api/carga-facil');
const api = fork(resolve(apiDirectory, 'prova-server.ts'), [], {
  cwd: apiDirectory,
  execArgv: ['--import', 'tsx'],
  env: {
    ...process.env,
    CARGA_FACIL_PORT: '0',
    NODE_V8_COVERAGE: coverageDirectory
  },
  stdio: ['ignore', 'inherit', 'inherit', 'ipc']
});
let tests;
let finished = false;
let shutdownTimer;
const timer = setTimeout(() => {
  console.error(
    'A API não iniciou em 30 segundos. Confira npm ci e Node 24.15+.'
  );
  finish(1);
}, 30000);

function finish(code) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  process.exitCode = code;
  if (tests && tests.exitCode === null) tests.kill('SIGTERM');
  shutdownTimer = setTimeout(() => {
    console.error(
      'A API não encerrou normalmente; a cobertura pode estar incompleta.'
    );
    process.exitCode = 1;
    api.kill('SIGKILL');
  }, 10000);
  shutdownTimer.unref();
  api.kill('SIGTERM');
}

api.once('message', ({ baseUrl, email, otherEmail, password }) => {
  clearTimeout(timer);
  console.info(`Carga Fácil pronto em ${baseUrl} (banco temporário).`);
  tests = spawn(
    process.execPath,
    [
      require.resolve('jest/bin/jest'),
      '--config',
      'jest.carga-facil.config.js',
      '--runInBand',
      ...process.argv.slice(2)
    ],
    {
      cwd: rootDirectory,
      env: {
        ...process.env,
        CARGA_FACIL_BASE_URL: baseUrl,
        CARGA_FACIL_EMAIL: email,
        CARGA_FACIL_OTHER_EMAIL: otherEmail,
        CARGA_FACIL_PASSWORD: password
      },
      stdio: 'inherit'
    }
  );
  tests.once('error', error => {
    console.error(error.message);
    finish(1);
  });
  tests.once('exit', code => finish(code ?? 1));
});
api.once('error', error => {
  console.error(error.message);
  finish(1);
});
api.once('exit', () => {
  if (!finished) {
    console.error('A API encerrou antes de terminar os testes.');
    finish(1);
  }
});
// O LCOV só é gerado após o backend encerrar e gravar a cobertura V8.
api.once('close', () => {
  clearTimeout(shutdownTimer);
  if (!tests || process.exitCode === 130) return;
  const report = spawn(
    process.execPath,
    [require.resolve('c8/bin/c8.js'), 'report'],
    { cwd: rootDirectory, stdio: 'inherit' }
  );
  report.once('error', error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  report.once('exit', code => {
    if (code !== 0) process.exitCode = 1;
  });
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => finish(130));
