export function createRunnerClient({ baseUrl, token = '', fetchImpl = fetch }) {
  const root = baseUrl.replace(/\/$/, '');

  return {
    async fetchProfile() {
      return request(`${root}/api/profile`, { token, fetchImpl });
    },

    async fetchApprovedPackages() {
      return request(`${root}/api/packages?approvalState=approved`, { token, fetchImpl });
    },

    async markRunnerStatus(id, payload) {
      return request(`${root}/api/packages/${id}/runner`, {
        token,
        fetchImpl,
        options: {
          method: 'PATCH',
          body: JSON.stringify(payload),
          headers: { 'content-type': 'application/json' },
        },
      });
    },

    async createJob(job) {
      return request(`${root}/api/jobs`, {
        token,
        fetchImpl,
        options: {
          method: 'POST',
          body: JSON.stringify(job),
          headers: { 'content-type': 'application/json' },
        },
      });
    },
  };
}

async function request(url, { token, fetchImpl, options = {} }) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetchImpl(url, { ...options, headers });
  if (!response.ok) {
    throw new Error(`Dashboard API ${response.status}: ${url}`);
  }
  return response.json();
}
