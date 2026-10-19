import type { Instrument, TradeEvent, Session } from "../model";
export type BrokerProvider =
  | "snaptrade"
  | "tradestation"
  | "tradovate"
  | "ibkr"
  | "projectx"
  | "rithmic"
  | "oanda"
  | "alpaca"
  | "tastytrade";
export type BrokerCredentials = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  userId?: string;
  userSecret?: string;
  userName?: string;
  apiKey?: string;
  environment?: "live" | "paper";
  queryId?: string;
};
export type BrokerAccount = {
  id: string;
  providerId: string;
  institution: string;
  number: string;
  name: string;
  currency: string;
  environment: "live" | "paper";
  identityVerified: boolean;
};
export type RawExecution = {
  id: string;
  t: number;
  action: "buy" | "sell";
  price: number;
  quantity: number;
  instrument: Instrument;
  currency: string;
  fees?: number;
  pnl?: number;
  revision?: number;
  voided?: boolean;
  positionBefore?: number;
  openedQuantity?: number;
  closedQuantity?: number;
  timePrecision?: TradeEvent["timePrecision"];
  raw: Record<string, unknown>;
};
export type ExecutionPage = {
  records: RawExecution[];
  cursor: Record<string, unknown>;
  complete: boolean;
};
export interface BrokerAdapter {
  provider: BrokerProvider;
  accounts(credentials: BrokerCredentials): Promise<BrokerAccount[]>;
  executions(
    credentials: BrokerCredentials,
    account: BrokerAccount,
    cursor: Record<string, unknown>,
  ): Promise<ExecutionPage>;
  disconnect?(credentials: BrokerCredentials): Promise<void>;
}
export type IntakeRecord = {
  id: string;
  revision: number;
  hash: string;
  raw: Record<string, unknown>;
  events: TradeEvent[];
  session: Session;
};
