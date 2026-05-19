import test from 'node:test';
import assert from 'node:assert/strict';

import { createRunnerManager } from '../runner/run-manager.mjs';

test('starts a known runner command and records output', async () => {
  const spawned = [];
  const manager = createRunnerManager({
    spawnImpl: (command, args, options) => {
      spawned.push({ command, args, options });
      const listeners = {};
      return {
        pid: 123,
        stdout: { on(event, fn) { listeners[`stdout:${event}`] = fn; } },
        stderr: { on(event, fn) { listeners[`stderr:${event}`] = fn; } },
        on(event, fn) { listeners[event] = fn; },
        emitStdout(text) { listeners['stdout:data']?.(Buffer.from(text)); },
        emitClose(code) { listeners.close?.(code); },
      };
    },
  });

  const run = manager.start('discover');
  assert.equal(run.status, 'running');
  assert.equal(spawned[0].args.at(-1), 'portal-discovery-runner.mjs');

  run.process.emitStdout('Found 3 jobs\n');
  run.process.emitClose(0);

  const current = manager.status();
  assert.equal(current.discover.status, 'exited');
  assert.match(current.discover.logs.at(-1).message, /exited with code 0/);
});

test('rejects unknown runner names', () => {
  const manager = createRunnerManager({ spawnImpl: () => { throw new Error('not expected'); } });
  assert.throws(() => manager.start('unknown'), /Unknown runner/);
});
