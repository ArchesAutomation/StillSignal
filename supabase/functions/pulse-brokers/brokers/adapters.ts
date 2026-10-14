import type { BrokerAdapter, BrokerProvider } from "./model.ts";
import { ProviderError } from "./http.ts";
import { snaptrade } from "./snaptrade.ts";
import { projectx } from "./projectx.ts";
import { oanda } from "./oanda.ts";
import { tradestation } from "./tradestation.ts";
import { tradovate } from "./tradovate.ts";
const adapters: Partial<Record<BrokerProvider, BrokerAdapter>> = {
  snaptrade,
  projectx,
  oanda,
  tradestation,
  tradovate,
};
export function brokerAdapter(provider: BrokerProvider): BrokerAdapter {
  const adapter = adapters[provider];
  if (!adapter) throw new ProviderError("APPROVED_RELAY_REQUIRED");
  return adapter;
}
