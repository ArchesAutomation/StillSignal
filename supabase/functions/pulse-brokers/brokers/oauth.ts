import { providerJson, ProviderError } from "./http.ts";
import type { BrokerCredentials, BrokerProvider } from "./model.ts";
import { tastyHeaders, tastyOrigin } from "./tastytrade.ts";
export function callbackUrl() {
  const url = new URL(Deno.env.get("APP_ORIGIN") || "");
  if (url.protocol !== "https:" && url.hostname !== "localhost")
    throw new Error("NOT_CONFIGURED");
  return url.origin + "/api/brokers/callback";
}
export function authorizeUrl(
  provider: BrokerProvider,
  state: string,
  environment: "live" | "paper" = "live",
) {
  const redirect = callbackUrl();
  if (provider === "alpaca")
    return (
      "https://app.alpaca.markets/oauth/authorize?" +
      new URLSearchParams({
        response_type: "code",
        client_id: Deno.env.get("ALPACA_CLIENT_ID")!,
        redirect_uri: redirect,
        state,
        env: environment,
        // Alpaca assumes read-only access when write/trading scopes are omitted.
      })
    );
  if (provider === "tastytrade")
    return (
      (environment === "paper"
        ? "https://cert-my.staging-tasty.works/auth.html?"
        : "https://my.tastytrade.com/auth.html?") +
      new URLSearchParams({
        response_type: "code",
        client_id:
          environment === "paper"
            ? Deno.env.get("TASTYTRADE_PAPER_CLIENT_ID")!
            : Deno.env.get("TASTYTRADE_CLIENT_ID")!,
        redirect_uri: redirect,
        state,
        scope: "read",
      })
    );
  if (provider === "tradestation")
    return (
      "https://signin.tradestation.com/authorize?" +
      new URLSearchParams({
        response_type: "code",
        client_id: Deno.env.get("TRADESTATION_CLIENT_ID")!,
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
        client_id: Deno.env.get("TRADOVATE_CLIENT_ID")!,
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
  if (provider === "alpaca" || provider === "tastytrade") {
    const tasty = provider === "tastytrade";
    const clientId = tasty
      ? environment === "paper"
        ? Deno.env.get("TASTYTRADE_PAPER_CLIENT_ID")
        : Deno.env.get("TASTYTRADE_CLIENT_ID")
      : Deno.env.get("ALPACA_CLIENT_ID");
    const clientSecret = tasty
      ? environment === "paper"
        ? Deno.env.get("TASTYTRADE_PAPER_CLIENT_SECRET")
        : Deno.env.get("TASTYTRADE_CLIENT_SECRET")
      : Deno.env.get("ALPACA_CLIENT_SECRET");
    const body = {
      grant_type: "authorization_code",
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: callbackUrl(),
    };
    const result = await providerJson(
      tasty
        ? tastyOrigin({ environment }) + "/oauth/token"
        : "https://api.alpaca.markets/oauth/token",
      {
        method: "POST",
        headers: {
          ...(tasty ? tastyHeaders : {}),
          "Content-Type": tasty
            ? "application/json"
            : "application/x-www-form-urlencoded",
        },
        body: tasty ? JSON.stringify(body) : new URLSearchParams(body),
      },
    );
    if (
      !result.access_token ||
      (tasty &&
        (!result.refresh_token ||
          !Number.isFinite(Number(result.expires_in)) ||
          Number(result.expires_in) <= 0))
    )
      throw new ProviderError("PROVIDER_REAUTH");
    return {
      accessToken: result.access_token,
      environment,
      ...(result.refresh_token ? { refreshToken: result.refresh_token } : {}),
      ...(result.expires_in
        ? { expiresAt: Date.now() + Number(result.expires_in) * 1000 }
        : {}),
    };
  }
  if (provider === "tradestation") {
    const result = await providerJson(
      "https://signin.tradestation.com/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: Deno.env.get("TRADESTATION_CLIENT_ID")!,
          client_secret: Deno.env.get("TRADESTATION_CLIENT_SECRET")!,
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
          cid: Number(Deno.env.get("TRADOVATE_CLIENT_ID")),
          sec: Deno.env.get("TRADOVATE_CLIENT_SECRET"),
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
  if (provider === "tastytrade" && credentials.refreshToken) {
    const result = await providerJson(
      tastyOrigin(credentials) + "/oauth/token",
      {
        method: "POST",
        headers: { ...tastyHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: credentials.refreshToken,
          client_secret:
            credentials.environment === "paper"
              ? Deno.env.get("TASTYTRADE_PAPER_CLIENT_SECRET")
              : Deno.env.get("TASTYTRADE_CLIENT_SECRET"),
          scope: "read",
        }),
      },
    );
    if (
      !result.access_token ||
      !Number.isFinite(Number(result.expires_in)) ||
      Number(result.expires_in) <= 0
    )
      throw new ProviderError("PROVIDER_REAUTH");
    return {
      ...credentials,
      accessToken: result.access_token,
      expiresAt: Date.now() + Number(result.expires_in) * 1000,
    };
  }
  if (provider === "tradestation" && credentials.refreshToken) {
    const result = await providerJson(
      "https://signin.tradestation.com/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: Deno.env.get("TRADESTATION_CLIENT_ID")!,
          client_secret: Deno.env.get("TRADESTATION_CLIENT_SECRET")!,
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
    return (await import("./projectx.ts")).projectxLogin(credentials);
  throw new ProviderError("PROVIDER_REAUTH");
}
