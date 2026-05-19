import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const runnerDir = path.dirname(fileURLToPath(import.meta.url));
const commands = {
  discover: 'portal-discovery-runner.mjs',
  'score-ai': 'ai-fit-runner.mjs',
  'draft-ai': 'ai-draft-runner.mjs',
  applications: 'playwright-runner.mjs',
};

export function createRunnerManager({
  spawnImpl = spawn,
  envProvider = () => ({}),
  now = () => new Date(),
  maxLogs = 400,
} = {}) {
  const runs = new Map(Object.keys(commands).map(name => [name, createRunState(name)]));

  function start(name) {
    if (!commands[name]) throw new Error(`Unknown runner: ${name}`);
    const current = runs.get(name);
    if (current?.status === 'running') return current;

    const run = createRunState(name);
    run.status = 'running';
    run.startedAt = now().toISOString();
    run.logs.push(logEntry('system', `Starting ${name} runner...`, now));

    const child = spawnImpl(process.execPath, [commands[name]], {
      cwd: runnerDir,
      env: {
        ...process.env,
        ...envProvider(),
      },
      windowsHide: true,
    });

    run.pid = child.pid || null;
    run.process = child;
    runs.set(name, run);

    child.stdout?.on('data', chunk => appendLog(run, 'stdout', chunk, now, maxLogs));
    child.stderr?.on('data', chunk => appendLog(run, 'stderr', chunk, now, maxLogs));
    child.on?.('error', error => {
      run.status = 'error';
      run.finishedAt = now().toISOString();
      run.logs.push(logEntry('system', error.message, now));
    });
    child.on?.('close', code => {
      run.status = 'exited';
      run.exitCode = code;
      run.finishedAt = now().toISOString();
      run.logs.push(logEntry('system', `${name} runner exited with code ${code}`, now));
    });

    return run;
  }

  function status() {
    return Object.fromEntries([...runs.entries()].map(([name, run]) => [name, publicRun(run)]));
  }

  function logs(name) {
    if (!commands[name]) throw new Error(`Unknown runner: ${name}`);
    return publicRun(runs.get(name)).logs;
  }

  return { start, status, logs };
}

function createRunState(name) {
  return {
    name,
    status: 'idle',
    pid: null,
    exitCode: null,
    startedAt: null,
    finishedAt: null,
    logs: [],
  };
}

function appendLog(run, stream, chunk, now, maxLogs) {
  for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) {
    run.logs.push(logEntry(stream, line, now));
  }
  if (run.logs.length > maxLogs) run.logs.splice(0, run.logs.length - maxLogs);
}

function logEntry(stream, message, now) {
  return {
    at: now().toISOString(),
    stream,
    message,
  };
}

function publicRun(run) {
  const { process: _process, ...safeRun } = run || createRunState('unknown');
  return safeRun;
}
