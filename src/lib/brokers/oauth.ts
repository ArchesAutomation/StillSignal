import { providerJson, ProviderError } from "./http";
import type { BrokerCredentials, BrokerProvider } from "./model";
export function callbackUrl() {
  const url = new URL(process.env.APP_ORIGIN || "");
  if (url.protocol !== "https:" && url.hostname !== "localhost")
    throw new Error("NOT_CONFIGURED");
  return url.origin + "/api/brokers/callback";
}
export function authorizeUrl(provider: BrokerProvider, state: string) {
  const redirect = callbackUrl();
  if (provider === "tradestation")
    return (
      "https://signin.tradestation.com/authorize?" +
      new URLSearchParams({
        response_type: "code",
        client_id: process.env.TRADESTATION_CLIENT_ID!,
        redirect_uri: redirect,
        audience: "https://api.tradestation.com",
        state,
        scope: "openid offline_access ReadAccount MarketData",
      }).toString()
    );
  if (provider === "tradovate")
    return (
      "https://trader.tradovate.com/oauth?" +
      new URLSearchParams({
        response_type: "code",
        client_id: process.env.TRADOVATE_CLIENT_ID!,
        redirect_uri: redirect,
        state,
      }).toString()
    );
  throw new ProviderError("OAUTH_UNAVAILABLE");
}
export async function exchangeCode(
  provider: BrokerProvider,
  code: string,
  environment: "live" | "paper",
): Promise<BrokerCredentials> {
  if (provider === "tradestation") {
    const result = await providerJson(
      "https://signin.tradestation.com/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: process.env.TRADESTATION_CLIENT_ID!,
          client_secret: process.env.TRADESTATION_CLIENT_SECRET!,
          code,
          redirect_uri: callbackUrl(),
        }),
      },
    );
    if (!result.access_token) throw new ProviderError("PROVIDER_REAUTH");
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: Date.now() + result.expires_in * 1000,
      environment,
    };
  }
  if (provider === "tradovate") {
    const result = await providerJson(
      (environment === "paper"
        ? "https://demo.tradovateapi.com"
        : "https://live.tradovateapi.com") + "/v1/auth/oauthtoken",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          cid: Number(process.env.TRADOVATE_CLIENT_ID),
          sec: process.env.TRADOVATE_CLIENT_SECRET,
          redirect_uri: callbackUrl(),
        }),
      },
    );
    if (!result.access_token) throw new ProviderError("PROVIDER_REAUTH");
    return {
      accessToken: result.access_token,
      expiresAt: Date.now() + result.expires_in * 1000,
      environment,
    };
  }
  throw new ProviderError("OAUTH_UNAVAILABLE");
}
export async function refreshCredentials(
  provider: BrokerProvider,
  credentials: BrokerCredentials,
): Promise<BrokerCredentials> {
  if (!credentials.expiresAt || credentials.expiresAt > Date.now() + 60000)
    return credentials;
  if (provider === "tradestation" && credentials.refreshToken) {
    const result = await providerJson(
      "https://signin.tradestation.com/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: process.env.TRADESTATION_CLIENT_ID!,
          client_secret: process.env.TRADESTATION_CLIENT_SECRET!,
          refresh_token: credentials.refreshToken,
        }),
      },
    );
    if (!result.access_token) throw new ProviderError("PROVIDER_REAUTH");
    return {
      ...credentials,
      accessToken: result.access_token,
      refreshToken: result.refresh_token || credentials.refreshToken,
      expiresAt: Date.now() + result.expires_in * 1000,
    };
  }
  if (provider === "tradovate") {
    const result = await providerJson(
      (credentials.environment === "paper"
        ? "https://demo.tradovateapi.com"
        : "https://live.tradovateapi.com") + "/v1/auth/renewaccesstoken",
      { headers: { Authorization: "Bearer " + credentials.accessToken } },
    );
    if (!result.accessToken) throw new ProviderError("PROVIDER_REAUTH");
    return {
      ...credentials,
      accessToken: result.accessToken,
      expiresAt: Date.parse(result.expirationTime),
    };
  }
  if (provider === "projectx")
    return (await import("./projectx")).projectxLogin(credentials);
  throw new ProviderError("PROVIDER_REAUTH");
}
