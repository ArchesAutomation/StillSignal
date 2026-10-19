begin;
-- Extend the provider allowlist without changing existing connections or RLS.
alter table public.pulse_broker_connections
  drop constraint pulse_broker_connections_provider_check;
alter table public.pulse_broker_connections
  add constraint pulse_broker_connections_provider_check
  check (provider in ('snaptrade','tradestation','tradovate','ibkr','projectx','rithmic','oanda','alpaca','tastytrade'));
commit;
