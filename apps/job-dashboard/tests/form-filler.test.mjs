import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFieldCandidates,
  buildRequiredFields,
  isSubmitControl,
} from '../runner/form-filler.mjs';

test('builds common aliases for application fields', () => {
  const candidates = buildFieldCandidates('email');

  assert.ok(candidates.includes('email'));
  assert.ok(candidates.includes('E-mail'));
  assert.ok(candidates.includes('Email address'));
});

test('builds required fields from package, profile, and cover letter', () => {
  const fields = buildRequiredFields({
    packageFields: { salary_expectation: 'To discuss' },
    profile: {
      fullName: 'Ioan Stefan Vlaicu',
      email: 'ionut@example.com',
      phone: '+40 700 000 000',
      linkedin: 'https://www.linkedin.com/in/ioanstefanvlaicu/',
      github: 'https://github.com/Apollomakesit',
      location: 'Bucharest, Romania',
      applicationDefaults: { work_authorization: 'Authorized to work in Romania and EU' },
    },
    coverLetter: 'Dear team...',
  });

  assert.equal(fields.full_name, 'Ioan Stefan Vlaicu');
  assert.equal(fields.email, 'ionut@example.com');
  assert.equal(fields.salary_expectation, 'To discuss');
  assert.equal(fields.cover_letter, 'Dear team...');
  assert.equal(fields.work_authorization, 'Authorized to work in Romania and EU');
});

test('recognizes submit controls as protected final actions', () => {
  assert.equal(isSubmitControl('Submit application'), true);
  assert.equal(isSubmitControl('Trimite aplicatia'), true);
  assert.equal(isSubmitControl('Save draft'), false);
});
