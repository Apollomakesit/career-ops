import 'dotenv/config';

export class AiGenerationError extends Error {
  constructor(code, message, status = 424) {
    super(message);
    this.name = 'AiGenerationError';
    this.code = code;
    this.status = status;
  }
}

export function buildPackagePrompt({ profile = {}, job = {} }) {
  return [
    'Generate JSON for a reviewed Romanian job application package.',
    'The output must be useful for a human review step before any application is submitted.',
    '',
    'Candidate:',
    `Name: ${profile.fullName || ''}`,
    `Headline: ${profile.headline || ''}`,
    `Target roles: ${(profile.targetRoles || []).join(', ')}`,
    `Skills: ${(profile.skills || []).join(', ')}`,
    `Defaults: ${JSON.stringify(profile.applicationDefaults || {})}`,
    '',
    'Job:',
    `Company: ${job.company || ''}`,
    `Title: ${job.title || ''}`,
    `Location: ${job.location || ''}`,
    `Fit score: ${job.fitScore ?? job.fit?.score ?? ''}`,
    `Matched skills: ${(job.matchedSkills || job.fit?.matchedSkills || []).join(', ')}`,
    `Description: ${job.description || ''}`,
    '',
    'Return JSON with coverLetter, tailoredCvMd, requiredFields, and missingFields.',
    'requiredFields should contain form-ready values when the answer is known.',
    'missingFields should contain anything the candidate must confirm before applying.',
  ].join('\n');
}

export function resolveAiRuntimeConfig(env = process.env) {
  const provider = String(env.AI_PROVIDER || env.OPENAI_PROVIDER || 'openai').trim().toLowerCase();
  const model = env.AI_MODEL || env.OPENAI_MODEL || (provider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-5.2');
  const baseUrl = env.AI_BASE_URL || env.OPENAI_BASE_URL || '';
  const apiKey = env.AI_PROXY_API_KEY || env.AI_API_KEY || env.OPENAI_API_KEY || '';
  return {
    provider,
    model,
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
  };
}

export async function generateApplicationPackage({
  profile = {},
  job = {},
  provider,
  apiKey,
  model,
  baseUrl,
  fetchImpl = fetch,
} = {}) {
  const runtime = resolveAiRuntimeConfig();
  const config = {
    ...runtime,
    provider: provider ?? runtime.provider,
    apiKey: apiKey ?? runtime.apiKey,
    model: model ?? runtime.model,
    baseUrl: baseUrl ?? runtime.baseUrl,
  };

  if (!config.apiKey && !config.baseUrl) {
    throw new AiGenerationError(
      'ai_not_configured',
      'Configure AI locally with CLIProxyAPI or set OPENAI_API_KEY on the Railway job-dashboard service.',
    );
  }

  if (config.provider === 'anthropic') {
    return generateApplicationPackageViaAnthropicMessages({
      profile,
      job,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      fetchImpl,
    });
  }

  return generateApplicationPackageViaOpenAIResponses({
    profile,
    job,
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    fetchImpl,
  });
}

export async function generateApplicationPackageViaOpenAIResponses({
  profile = {},
  job = {},
  apiKey = '',
  model = 'gpt-5.2',
  baseUrl = '',
  fetchImpl = fetch,
} = {}) {
  if (!apiKey && !baseUrl) {
    throw new AiGenerationError(
      'ai_not_configured',
      'Set OPENAI_API_KEY or configure AI_BASE_URL for CLIProxyAPI.',
    );
  }

  const endpoint = `${normalizeProviderBaseUrl(baseUrl, 'openai')}/responses`;
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const response = await fetchOpenAIResponsesEndpoint({
    endpoint,
    headers,
    profile,
    job,
    model,
    fetchImpl,
  });

  return response;
}

async function fetchOpenAIResponsesEndpoint({
  endpoint,
  headers,
  profile,
  job,
  model,
  fetchImpl,
}) {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'You are a precise career assistant. Produce concise, truthful, ATS-friendly application materials. Return JSON only.',
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: buildPackagePrompt({ profile, job }) }],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'application_package',
          strict: false,
          schema: packageSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await safeResponseText(response);
    throw new AiGenerationError(
      'ai_generation_failed',
      `AI package generation failed with ${response.status}${detail ? `: ${detail}` : ''}`,
      502,
    );
  }

  const payload = await response.json();
  return parseGeneratedPackageText(extractOutputText(payload), 'AI returned invalid JSON');
}

export async function generateApplicationPackageViaAnthropicMessages({
  profile = {},
  job = {},
  apiKey = '',
  model = 'claude-sonnet-4-5',
  baseUrl = '',
  fetchImpl = fetch,
} = {}) {
  const endpoint = `${normalizeProviderBaseUrl(baseUrl, 'anthropic')}/messages`;
  const headers = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system: 'You are a precise career assistant. Produce concise, truthful, ATS-friendly application materials. Return JSON only.',
      messages: [
        {
          role: 'user',
          content: buildPackagePrompt({ profile, job }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await safeResponseText(response);
    throw new AiGenerationError(
      'ai_generation_failed',
      `Anthropic package generation failed with ${response.status}${detail ? `: ${detail}` : ''}`,
      502,
    );
  }

  const payload = await response.json();
  return parseGeneratedPackageText(extractAnthropicText(payload), 'Anthropic returned invalid JSON');
}

export function validateGeneratedPackage(value) {
  const missing = ['coverLetter', 'tailoredCvMd', 'requiredFields', 'missingFields']
    .filter(key => !(key in (value || {})));
  if (missing.length > 0) {
    throw new Error('Generated package must include coverLetter, tailoredCvMd, requiredFields, and missingFields.');
  }
  if (typeof value.coverLetter !== 'string' || typeof value.tailoredCvMd !== 'string') {
    throw new Error('Generated package coverLetter and tailoredCvMd must be strings.');
  }
  if (!isPlainObject(value.requiredFields) || !isPlainObject(value.missingFields)) {
    throw new Error('Generated package requiredFields and missingFields must be objects.');
  }
  return {
    coverLetter: value.coverLetter.trim(),
    tailoredCvMd: value.tailoredCvMd.trim(),
    requiredFields: value.requiredFields,
    missingFields: value.missingFields,
  };
}

export function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;

  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

export function extractAnthropicText(payload) {
  const chunks = [];
  for (const item of payload?.content || []) {
    if (typeof item?.text === 'string') chunks.push(item.text);
  }
  return chunks.join('\n').trim();
}

function parseGeneratedPackageText(outputText, prefix) {
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    throw new AiGenerationError('ai_generation_failed', `${prefix}: ${error.message}`, 502);
  }
  return validateGeneratedPackage(parsed);
}

function normalizeProviderBaseUrl(baseUrl, provider) {
  const trimmed = String(baseUrl || '').replace(/\/$/, '');
  if (!trimmed) return 'https://api.openai.com/v1';
  if (/\/v1$/i.test(trimmed)) return trimmed;
  return `${trimmed}/api/provider/${provider === 'anthropic' ? 'anthropic' : 'openai'}/v1`;
}

async function safeResponseText(response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const stringMapSchema = {
  type: 'object',
  additionalProperties: { type: 'string' },
};

export const packageSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['coverLetter', 'tailoredCvMd', 'requiredFields', 'missingFields'],
  properties: {
    coverLetter: {
      type: 'string',
      description: 'A concise cover letter tailored to the job and candidate proof points.',
    },
    tailoredCvMd: {
      type: 'string',
      description: 'A tailored CV in markdown using truthful candidate experience only.',
    },
    requiredFields: stringMapSchema,
    missingFields: stringMapSchema,
  },
};
