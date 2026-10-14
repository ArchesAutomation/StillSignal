export class ProviderError extends Error {
  constructor(
    public code: string,
    public retryAfter = 60,
  ) {
    super(code);
  }
}
export async function providerJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: init.signal || AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new ProviderError(
      response.status === 429
        ? "PROVIDER_RATE_LIMIT"
        : response.status === 401 || response.status === 403
          ? "PROVIDER_REAUTH"
          : "PROVIDER_UNAVAILABLE",
      Math.max(
        1,
        Math.min(86400, Number(response.headers.get("Retry-After")) || 60),
      ),
    );
  return response.json();
}
