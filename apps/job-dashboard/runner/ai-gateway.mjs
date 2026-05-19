import { performance } from 'node:perf_hooks';

import {
  cheapModelTestPlan,
  normalizeSelectedAiModel,
  parseGatewayModelIds,
} from './ai-models.mjs';

const defaultRoot = 'http://127.0.0.1:8317';

export async function listGatewayModels({
  rootUrl = defaultRoot,
  apiKey = '',
  fetchImpl = fetch,
} = {}) {
  const endpoint = `${String(rootUrl).replace(/\/$/, '')}/v1/models`;
  const response = await fetchImpl(endpoint, {
    headers: authHeaders(apiKey),
  });
  const payload = await response.json();
  return {
    ok: response.ok,
    status: response.status,
    ids: parseGatewayModelIds(payload),
    raw: payload,
  };
}

export async function testCheapGatewayModels({
  apiKey = '',
  fetchImpl = fetch,
} = {}) {
  const results = [];
  for (const item of cheapModelTestPlan()) {
    results.push(await testAiGatewayModel({
      provider: item.provider,
      model: item.model,
      apiKey,
      fetchImpl,
    }));
  }
  return results;
}

export async function testAiGatewayModel({
  provider = 'openai',
  model = '',
  apiKey = '',
  fetchImpl = fetch,
} = {}) {
  const selected = normalizeSelectedAiModel({ provider, model });
  const started = performance.now();
  const endpoint = selected.provider === 'anthropic'
    ? `${selected.baseUrl}/messages`
    : `${selected.baseUrl}/responses`;

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(apiKey),
      },
      body: JSON.stringify(testPayloadFor(selected)),
    });
    const detail = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      provider: selected.provider,
      model: selected.model,
      requestedModel: selected.requestedModel,
      baseUrl: selected.baseUrl,
      ms: Math.round(performance.now() - started),
      detail: detail.slice(0, 500),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      provider: selected.provider,
      model: selected.model,
      requestedModel: selected.requestedModel,
      baseUrl: selected.baseUrl,
      ms: Math.round(performance.now() - started),
      detail: error.message,
    };
  }
}

function testPayloadFor(selected) {
  if (selected.provider === 'anthropic') {
    return {
      model: selected.model,
      max_tokens: 40,
      system: 'Return JSON only.',
      messages: [
        {
          role: 'user',
          content: 'Return exactly {"ok":true,"task":"career-ops-model-test"}',
        },
      ],
    };
  }

  return {
    model: selected.model,
    input: 'Return only JSON: {"ok":true,"task":"career-ops-model-test"}',
    max_output_tokens: 40,
  };
}

function authHeaders(apiKey) {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}
