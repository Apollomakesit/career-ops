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

export async function generateApplicationPackage({
  profile = {},
  job = {},
  apiKey = process.env.OPENAI_API_KEY || '',
  model = process.env.OPENAI_MODEL || 'gpt-5.2',
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) {
    throw new AiGenerationError(
      'ai_not_configured',
      'Set OPENAI_API_KEY on the Railway job-dashboard service to generate AI application packages.',
    );
  }

  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'You are a precise career assistant. Produce concise, truthful, ATS-friendly application materials. Do not invent metrics or experience.',
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
      `OpenAI package generation failed with ${response.status}${detail ? `: ${detail}` : ''}`,
      502,
    );
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    throw new AiGenerationError('ai_generation_failed', `OpenAI returned invalid JSON: ${error.message}`, 502);
  }

  return validateGeneratedPackage(parsed);
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
