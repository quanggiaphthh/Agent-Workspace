export type ProviderFailureClass =
  | 'authentication'
  | 'authorization'
  | 'quota'
  | 'transient'
  | 'malformed'
  | 'model'
  | 'unknown';

function providerStatus(err: any): number {
  return Number(err?.status ?? err?.statusCode ?? err?.response?.status ?? err?.code ?? 0);
}

export function classifyProviderFailure(err: any): ProviderFailureClass {
  const status = providerStatus(err);
  const message = String(err?.message || '').toLowerCase();

  // Explicit provider HTTP status is authoritative. Message heuristics are
  // only used when no usable HTTP status is available.
  if (status === 401) return 'authentication';
  if (status === 403) return 'authorization';
  if (status === 429) return 'quota';
  if (status >= 500 && status <= 599) return 'transient';
  if (status >= 400 && status <= 499) {
    if (/model.*(?:not found|unsupported|unavailable)|unknown model/.test(message)) {
      return 'model';
    }
    return 'malformed';
  }

  if (/invalid\s+(?:api\s*)?key|unauthori[sz]ed|authentication/.test(message)) {
    return 'authentication';
  }
  if (/forbidden|permission|scope|entitlement/.test(message)) {
    return 'authorization';
  }
  if (/quota|rate[ -]?limit|resource exhausted/.test(message)) {
    return 'quota';
  }
  if (/model.*(?:not found|unsupported|unavailable)|unknown model/.test(message)) {
    return 'model';
  }
  if (/timeout|temporar|network|fetch failed/.test(message)) {
    return 'transient';
  }
  return 'unknown';
}

export function shouldRotateCredential(err: any, responseAlreadyStarted: boolean): boolean {
  if (responseAlreadyStarted) return false;
  const failure = classifyProviderFailure(err);
  return failure === 'authentication' || failure === 'quota';
}

export function toSafeProviderError(err: any): Error & { code?: string; status?: number } {
  const failure = classifyProviderFailure(err);
  const status = providerStatus(err) || 500;
  const messages: Record<ProviderFailureClass, string> = {
    authentication: 'Provider authentication failed for the selected credential.',
    authorization: 'Provider credential does not have permission for this request.',
    quota: 'Provider quota or rate limit was reached for the selected credential.',
    transient: 'Provider is temporarily unavailable.',
    malformed: 'Provider rejected the request.',
    model: 'Provider model is unavailable or unsupported.',
    unknown: 'Provider request failed.',
  };
  const safe = new Error(messages[failure]) as Error & { code?: string; status?: number };
  safe.code = `PROVIDER_${failure.toUpperCase()}`;
  safe.status = status;
  return safe;
}
