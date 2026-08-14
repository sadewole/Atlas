CREATE TABLE "wallet_sequences" (
	"currency" varchar(3) PRIMARY KEY NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL
);

-- Backfill the counter from existing wallets so the next wallet continues
-- after the current max sequence per currency (never reuses a number).
INSERT INTO "wallet_sequences" ("currency", "value")
SELECT
	substring("wallet_number" from '^ATL-([A-Z]{3})-[0-9]+-') AS "currency",
	MAX(CAST(substring("wallet_number" from '^ATL-[A-Z]{3}-([0-9]+)-') AS bigint)) AS "value"
FROM "wallets"
WHERE "wallet_number" ~ '^ATL-[A-Z]{3}-[0-9]+-'
GROUP BY substring("wallet_number" from '^ATL-([A-Z]{3})-[0-9]+-');
