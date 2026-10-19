import type { BrokerAdapter, BrokerProvider } from "./model";
import { ProviderError } from "./http";
import { snaptrade } from "./snaptrade";
import { projectx } from "./projectx";
import { oanda } from "./oanda";
import { tradestation } from "./tradestation";
import { tradovate } from "./tradovate";
import { alpaca } from "./alpaca";
import { tastytrade } from "./tastytrade";
const adapters: Partial<Record<BrokerProvider, BrokerAdapter>> = {
  snaptrade,
  projectx,
  oanda,
  tradestation,
  tradovate,
  alpaca,
  tastytrade,
};
export function brokerAdapter(provider: BrokerProvider): BrokerAdapter {
  const adapter = adapters[provider];
  if (!adapter) throw new ProviderError("APPROVED_RELAY_REQUIRED");
  return adapter;
}
