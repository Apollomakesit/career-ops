export const fieldAliases = {
  full_name: ['full_name', 'Full name', 'Name', 'Nume', 'Nume complet', 'Legal name'],
  first_name: ['first_name', 'First name', 'Prenume'],
  last_name: ['last_name', 'Last name', 'Nume de familie'],
  email: ['email', 'E-mail', 'Email address', 'Adresa email'],
  phone: ['phone', 'Phone', 'Phone number', 'Telefon', 'Numar de telefon'],
  location: ['location', 'Location', 'City', 'Oras', 'Locatie'],
  linkedin: ['linkedin', 'LinkedIn', 'LinkedIn profile', 'Profil LinkedIn'],
  github: ['github', 'GitHub', 'GitHub profile', 'Portfolio'],
  cover_letter: ['cover_letter', 'Cover letter', 'Scrisoare de intentie', 'Message to recruiter', 'Additional information'],
  work_authorization: ['work_authorization', 'Work authorization', 'Drept de munca', 'Authorized to work'],
  salary_expectation: ['salary_expectation', 'Salary expectation', 'Expected salary', 'Salariu dorit', 'Pretentii salariale'],
  notice_period: ['notice_period', 'Notice period', 'Preaviz'],
};

export function buildRequiredFields({ packageFields = {}, profile = {}, coverLetter = '' } = {}) {
  return {
    full_name: profile.fullName || '',
    email: profile.email || '',
    phone: profile.phone || '',
    location: profile.location || '',
    linkedin: profile.linkedin || '',
    github: profile.github || '',
    cover_letter: coverLetter || '',
    work_authorization: profile.applicationDefaults?.work_authorization || '',
    notice_period: profile.applicationDefaults?.notice_period || '',
    ...packageFields,
  };
}

export function buildFieldCandidates(label, fieldHints = {}) {
  return unique([
    ...(fieldHints.fieldAliases?.[label] || []),
    ...(fieldHints.fields?.[label] || []),
    ...(fieldAliases[label] || [label, humanize(label)]),
  ]);
}

export async function fillKnownFields(page, fields, missingFields = {}, options = {}) {
  for (const [label, value] of Object.entries(fields)) {
    if (!value) {
      missingFields[label] = 'Required value is empty.';
      continue;
    }

    const filled = await tryFillField(page, label, value, options.fieldHints || {});
    if (!filled) missingFields[label] = 'Could not locate a matching field on the page.';
  }
  return missingFields;
}

export async function tryFillField(page, label, value, fieldHints = {}) {
  for (const candidate of buildFieldCandidates(label, fieldHints)) {
    const locators = [
      page.getByLabel(candidate),
      page.getByPlaceholder(candidate),
      page.locator(`[name="${cssEscape(candidate)}"]`),
      page.locator(`[aria-label="${cssEscape(candidate)}"]`),
    ];

    for (const locator of locators) {
      try {
        if (await locator.count() > 0) {
          const target = locator.first();
          if (await target.isEditable({ timeout: 1000 }).catch(() => false)) {
            await target.fill(String(value), { timeout: 2000 });
            return true;
          }
        }
      } catch {
        // Continue with the next locator strategy.
      }
    }
  }

  return false;
}

export function isSubmitControl(label) {
  return /\b(submit|send|apply|trimite|aplica|aplică|finalizeaza|finalizează)\b/i.test(String(label));
}

function humanize(value) {
  return String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}

function unique(values) {
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
}
