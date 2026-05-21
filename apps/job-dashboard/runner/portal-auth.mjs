const loginUrls = {
  linkedin: 'https://www.linkedin.com/login',
  ejobs: 'https://www.ejobs.ro/login',
  bestjobs: 'https://www.bestjobs.eu/ro/login',
  hipo: 'https://www.hipo.ro/locuri-de-munca/logincontcandidat',
};

export function portalLoginUrl(portal) {
  return loginUrls[String(portal || '').toLowerCase()] || '';
}

export function detectPortalSession({ portal = '', url = '', title = '', text = '' } = {}) {
  const name = String(portal || '').toLowerCase();
  const source = normalize(`${url}\n${title}\n${text}`);
  const genericBlock = /captcha|verify you are human|two factor|two-factor|2fa|verifica daca esti om/.test(source);
  if (genericBlock) return state({ needsLogin: true, reason: 'captcha-or-verification' });

  if (name === 'linkedin') return detectLinkedIn(source);
  if (name === 'ejobs') return detectEjobs(source);
  if (name === 'bestjobs') return detectBestJobs(source);
  if (name === 'hipo') return detectHipo(source);
  return state({ reason: 'unknown-portal' });
}

function detectLinkedIn(source) {
  // Several authenticated-only signals — accept if any two are present.
  // Requiring all three (my network + messaging + notifications) was too
  // strict: a single missing nav item on a search page made the runner
  // bounce a legitimately logged-in session.
  const authSignals = [
    /my network/,
    /messaging/,
    /notifications/,
    /sign out/,
    /\blog out\b/,
    /linkedin\.com\/feed/,
    /linkedin\.com\/in\//,
    /linkedin\.com\/mynetwork/,
    /linkedin\.com\/jobs\/collections/,
    /linkedin\.com\/messaging/,
  ].filter(pattern => pattern.test(source)).length;
  if (authSignals >= 2) return state({ authenticated: true, reason: 'linkedin-authenticated-shell' });

  // Definite login wall: actual login URL, or a password prompt on a page
  // with no auth signals. "Join now" / "sign in to view" alone aren't enough
  // — LinkedIn shows those CTAs to logged-in users too.
  if (authSignals === 0 && /sign in with google|continue with google/.test(source)) {
    return state({ needsLogin: true, reason: 'linkedin-google-sign-in' });
  }
  if (/linkedin\.com\/login\b|linkedin\.com\/uas\/login\b|linkedin\.com\/checkpoint/.test(source)) {
    return state({ needsLogin: true, reason: 'linkedin-login-wall' });
  }
  if (authSignals === 0 && /email or phone password/.test(source)) {
    return state({ needsLogin: true, reason: 'linkedin-login-wall' });
  }
  return state({ reason: 'linkedin-no-auth-wall' });
}

function detectEjobs(source) {
  if (/contul meu|profilul meu|candidaturile mele|cv-ul meu|ioan stefan/.test(source)) {
    return state({ authenticated: true, reason: 'ejobs-authenticated-shell' });
  }
  if (/(ejobs\.ro\/login|email parola|autentificare parola|continua cu google|sign in with google)/.test(source)) {
    return state({ needsLogin: true, reason: 'ejobs-login-wall' });
  }
  return state({ reason: 'ejobs-no-auth-wall' });
}

function detectBestJobs(source) {
  if (/ioan stefan|contul meu|profilul meu|setari cont|deconectare/.test(source)) {
    return state({ authenticated: true, reason: 'bestjobs-authenticated-shell' });
  }
  if (/(bestjobs\.eu\/ro\/login|bestjobs\.eu\/login|email parola|autentificare parola|continua cu google|sign in with google)/.test(source)) {
    return state({ needsLogin: true, reason: 'bestjobs-login-wall' });
  }
  return state({ reason: 'bestjobs-no-auth-wall' });
}

function detectHipo(source) {
  if (/my hipo|contul meu|profil candidat|logout|deconectare|iesire/.test(source)) {
    return state({ authenticated: true, reason: 'hipo-authenticated-shell' });
  }
  if (/(logincontcandidat|email parola|autentificare parola|continua cu google|sign in with google)/.test(source)) {
    return state({ needsLogin: true, reason: 'hipo-login-wall' });
  }
  return state({ reason: 'hipo-no-auth-wall' });
}

function state({ authenticated = false, needsLogin = false, reason = '' } = {}) {
  return { authenticated, needsLogin, reason };
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}/.:-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
