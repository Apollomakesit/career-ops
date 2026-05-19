import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPackagePrompt,
  generateApplicationPackage,
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

test('rejects incomplete AI package JSON', () => {
  assert.throws(
    () => validateGeneratedPackage({ coverLetter: 'Only one field' }),
    /coverLetter, tailoredCvMd, requiredFields, and missingFields/,
  );
});
