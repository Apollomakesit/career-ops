import { annotateModelAvailability, listConfiguredAiModels } from './ai-models.mjs';
import { listGatewayModels, testAiGatewayModel, testCheapGatewayModels } from './ai-gateway.mjs';

export function applyDesiredConfig({ current = {}, desired = {}, saveConfig = value => value } = {}) {
  if (!desired?.updatedAt || current.remoteConfigUpdatedAt === desired.updatedAt) return current;
  const { updatedAt, ...desiredValues } = desired;
  for (const key of ['dashboardToken', 'aiProxyApiKey']) {
    if (!desiredValues[key] || desiredValues[key] === 'configured') {
      desiredValues[key] = current[key] || '';
    }
  }
  return saveConfig({
    ...current,
    ...desiredValues,
    remoteConfigUpdatedAt: updatedAt,
  });
}

export async function syncCloudRunner({
  client,
  manager,
  loadConfig,
  saveConfig,
  redactConfig,
  listModels = listGatewayModels,
  testModel = testAiGatewayModel,
  testCheapModels = testCheapGatewayModels,
  commandBindings = new Map(),
} = {}) {
  const cloudState = await client.fetchRunnerState().catch(() => ({}));
  let config = loadConfig();
  config = applyDesiredConfig({
    current: config,
    desired: cloudState.desiredConfig || {},
    saveConfig,
  });

  const aiGateway = config.aiProxyApiKey
    ? await listModels({ apiKey: config.aiProxyApiKey }).catch(error => ({ ok: false, status: 0, ids: [], error: error.message }))
    : { ok: false, status: 0, ids: [] };

  const status = manager.status();
  await client.updateRunnerState({
    status,
    config: redactConfig(config),
    aiGateway,
    aiModels: annotateModelAvailability(listConfiguredAiModels(), aiGateway.ids || []),
  });

  const claimed = await client.claimRunnerCommand().catch(() => null);
  if (claimed?.runner === 'test-ai') {
    await runAiTestCommand({ client, command: claimed, config, testModel });
  } else if (claimed?.runner === 'test-cheap-ai') {
    await runCheapAiTestCommand({ client, command: claimed, config, testCheapModels });
  } else if (claimed?.runner && !commandBindings.has(claimed.runner)) {
    manager.start(claimed.runner, claimed.payload || {});
    commandBindings.set(claimed.runner, claimed.id);
  }

  const latestStatus = manager.status();
  for (const [runner, commandId] of [...commandBindings.entries()]) {
    const run = latestStatus[runner];
    if (!run) continue;
    await client.updateRunnerCommand(commandId, {
      status: run.status,
      exitCode: run.exitCode,
      logs: run.logs || [],
    });
    if (['exited', 'error'].includes(run.status)) {
      commandBindings.delete(runner);
    }
  }
}

async function runAiTestCommand({ client, command, config, testModel }) {
  const result = await testModel({
    provider: command.payload?.provider || config.aiProvider,
    model: command.payload?.model || config.aiModel,
    apiKey: config.aiProxyApiKey,
  });
  await client.updateRunnerCommand(command.id, {
    status: 'exited',
    exitCode: result.ok ? 0 : 1,
    logs: [resultLog(result)],
  });
}

async function runCheapAiTestCommand({ client, command, config, testCheapModels }) {
  const results = await testCheapModels({ apiKey: config.aiProxyApiKey });
  await client.updateRunnerCommand(command.id, {
    status: results.some(result => result.ok) ? 'exited' : 'error',
    exitCode: results.some(result => result.ok) ? 0 : 1,
    logs: results.map(resultLog),
  });
}

function resultLog(result) {
  const status = result.ok ? 'OK' : `FAILED ${result.status || ''}`.trim();
  return {
    at: new Date().toISOString(),
    stream: result.ok ? 'stdout' : 'stderr',
    message: `${status} ${result.provider} ${result.model} (${result.ms || 0}ms)`,
    detail: result.detail || '',
  };
}
