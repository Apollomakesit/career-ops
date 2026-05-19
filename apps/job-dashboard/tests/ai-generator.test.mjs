import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFitPrompt,
  buildPackagePrompt,
  generateAiFitScore,
  generateAiFitScoreViaAnthropicMessages,
  generateAiFitScoreViaOpenAIResponses,
  generateApplicationPackageViaAnthropicMessages,
  generateApplicationPackage,
  generateApplicationPackageViaOpenAIResponses,
  resolveAiRuntimeConfig,
  validateGeneratedFitScore,
  validateGeneratedPackage,
} from '../src/ai-generator.mjs';

const profile = {
  fullName: 'Ioan Stefan Vlaicu',
  headline: 'Senior support specialist and MDM administrator who builds automation',
  targetRoles: ['Application Support Engineer', 'Python/FastAPI Developer'],
  skills: ['ServiceNow', 'Workspace ONE', 'Python', 'FastAPI'],
  applicationDefaults: { work_authorization: 'Authorized to work in Romania and EU' },
};

const job = {
  title: 'Application Support Engineer',
  company: 'ExampleSoft',
  location: 'Bucharest',
  description: 'Support ServiceNow workflows, MDM devices, and Python automation.',
  fitScore: 91,
  matchedSkills: ['ServiceNow', 'Workspace ONE', 'Python'],
};

test('builds a package prompt from profile and job context', () => {
  const prompt = buildPackagePrompt({ profile, job });

  assert.match(prompt, /Ioan Stefan Vlaicu/);
  assert.match(prompt, /Application Support Engineer/);
  assert.match(prompt, /ServiceNow/);
  assert.match(prompt, /JSON/);
});

test('builds a fit scoring prompt from profile, job, and rules score', () => {
  const prompt = buildFitPrompt({
    profile,
    job,
    rulesFit: { score: 91, matchedSkills: ['ServiceNow'], missingSkills: ['Azure'] },
  });

  assert.match(prompt, /OwlApply-style/);
  assert.match(prompt, /Ioan Stefan Vlaicu/);
  assert.match(prompt, /Application Support Engineer/);
  assert.match(prompt, /ServiceNow/);
  assert.match(prompt, /91/);
});

test('requires an OpenAI API key for real AI generation', async () => {
  await assert.rejects(
    () => generateApplicationPackage({ profile, job, apiKey: '' }),
    error => error.code === 'ai_not_configured',
  );
});

test('calls the Responses API with structured JSON output and validates the package', async () => {
  const calls = [];
  const generated = {
    coverLetter: 'Dear ExampleSoft, I can help with application support and MDM automation.',
    tailoredCvMd: '# Ioan Stefan Vlaicu\n\nApplication Support Engineer profile.',
    requiredFields: {
      full_name: 'Ioan Stefan Vlaicu',
      email: 'ionut@example.com',
      work_authorization: 'Authorized to work in Romania and EU',
    },
    missingFields: {
      salary_expectation: 'Confirm salary expectation before applying.',
    },
  };

  const result = await generateApplicationPackage({
    profile,
    job,
    apiKey: 'test-key',
    model: 'gpt-test',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { output_text: JSON.stringify(generated) };
        },
      };
    },
  });

  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].options.headers.authorization, 'Bearer test-key');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, 'gpt-test');
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(result.coverLetter, generated.coverLetter);
  assert.equal(result.requiredFields.full_name, 'Ioan Stefan Vlaicu');
});

test('can target a CLIProxyAPI OpenAI Responses endpoint instead of api.openai.com', async () => {
  const calls = [];
  await generateApplicationPackageViaOpenAIResponses({
    profile,
    job,
    apiKey: 'local-proxy-key',
    model: 'gpt-5.2',
    baseUrl: 'http://127.0.0.1:8317/api/provider/openai/v1',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            output: [{
              content: [{
                text: JSON.stringify({
                  coverLetter: 'Proxy cover letter',
                  tailoredCvMd: '# Proxy CV',
                  requiredFields: {},
                  missingFields: {},
                }),
              }],
            }],
          };
        },
      };
    },
  });

  assert.equal(calls[0].url, 'http://127.0.0.1:8317/api/provider/openai/v1/responses');
  assert.equal(calls[0].options.headers.authorization, 'Bearer local-proxy-key');
});

test('can target a CLIProxyAPI Anthropic messages endpoint', async () => {
  const calls = [];
  const result = await generateApplicationPackageViaAnthropicMessages({
    profile,
    job,
    apiKey: 'local-proxy-key',
    model: 'SubscriptionGateway/claude-sonnet-4-6',
    baseUrl: 'http://127.0.0.1:8317/api/provider/anthropic/v1',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                coverLetter: 'Anthropic cover letter',
                tailoredCvMd: '# Anthropic CV',
                requiredFields: { full_name: 'Ioan Stefan Vlaicu' },
                missingFields: {},
              }),
            }],
          };
        },
      };
    },
  });

  assert.equal(calls[0].url, 'http://127.0.0.1:8317/api/provider/anthropic/v1/messages');
  assert.equal(JSON.parse(calls[0].options.body).max_tokens, 4000);
  assert.equal(result.coverLetter, 'Anthropic cover letter');
});

test('can generate an AI fit score through an OpenAI-compatible Responses endpoint', async () => {
  const calls = [];
  const result = await generateAiFitScoreViaOpenAIResponses({
    profile,
    job,
    rulesFit: { score: 86 },
    apiKey: 'local-proxy-key',
    model: 'gpt-5.2',
    baseUrl: 'http://127.0.0.1:8317/api/provider/openai/v1',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            output_text: JSON.stringify({
              score: 88,
              category: 'strong',
              matchedSkills: ['ServiceNow', 'MDM', 'Python'],
              missingSkills: ['Azure App Service'],
              riskFlags: ['No explicit FastAPI requirement in JD'],
              recommendation: 'apply',
              reasons: ['Direct match for support, MDM, and automation.'],
            }),
          };
        },
      };
    },
  });

  assert.equal(calls[0].url, 'http://127.0.0.1:8317/api/provider/openai/v1/responses');
  assert.equal(JSON.parse(calls[0].options.body).text.format.name, 'job_fit_score');
  assert.equal(result.score, 88);
  assert.deepEqual(result.matchedSkills, ['ServiceNow', 'MDM', 'Python']);
});

test('can generate an AI fit score through a CLIProxyAPI Anthropic endpoint', async () => {
  const calls = [];
  const result = await generateAiFitScore({
    profile,
    job,
    rulesFit: { score: 74 },
    provider: 'anthropic',
    apiKey: 'local-proxy-key',
    model: 'SubscriptionGateway/claude-sonnet-4-6',
    baseUrl: 'http://127.0.0.1:8317/api/provider/anthropic/v1',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                score: 81,
                category: 'strong',
                matchedSkills: ['Application Support', 'MDM'],
                missingSkills: [],
                riskFlags: [],
                recommendation: 'apply',
                reasons: ['Strong enterprise support overlap.'],
              }),
            }],
          };
        },
      };
    },
  });

  assert.equal(calls[0].url, 'http://127.0.0.1:8317/api/provider/anthropic/v1/messages');
  assert.equal(JSON.parse(calls[0].options.body).max_tokens, 1800);
  assert.equal(result.score, 81);
  assert.equal(result.recommendation, 'apply');
});

test('resolves CLIProxyAI runtime configuration from environment-style values', () => {
  const config = resolveAiRuntimeConfig({
    AI_PROVIDER: 'anthropic',
    AI_BASE_URL: 'http://127.0.0.1:8317/api/provider/anthropic/v1',
    AI_PROXY_API_KEY: 'local-proxy-key',
    AI_MODEL: 'SubscriptionGateway/claude-sonnet-4-6',
  });

  assert.equal(config.provider, 'anthropic');
  assert.equal(config.baseUrl, 'http://127.0.0.1:8317/api/provider/anthropic/v1');
  assert.equal(config.apiKey, 'local-proxy-key');
  assert.equal(config.model, 'SubscriptionGateway/claude-sonnet-4-6');
});

test('rejects incomplete AI package JSON', () => {
  assert.throws(
    () => validateGeneratedPackage({ coverLetter: 'Only one field' }),
    /coverLetter, tailoredCvMd, requiredFields, and missingFields/,
  );
});

test('normalizes generated AI fit score JSON', () => {
  const fit = validateGeneratedFitScore({
    score: 103,
    matchedSkills: ['Python'],
    recommendation: 'unknown',
    reasons: ['Good overlap.'],
  });

  assert.equal(fit.score, 100);
  assert.equal(fit.category, 'excellent');
  assert.equal(fit.recommendation, 'review');
  assert.deepEqual(fit.missingSkills, []);
});
