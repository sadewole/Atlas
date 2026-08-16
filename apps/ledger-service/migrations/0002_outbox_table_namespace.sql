-- Namespace the outbox table per service so services sharing a local
-- database never drain each other's pending events.
ALTER TABLE "outbox_events" RENAME TO "ledger_outbox_events";
