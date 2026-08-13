CREATE TABLE "transfer_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"from_status" varchar(20),
	"to_status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'CREATED' NOT NULL,
	"source_wallet_id" uuid NOT NULL,
	"destination_wallet_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount" bigint NOT NULL,
	"fee_amount" bigint DEFAULT 0 NOT NULL,
	"description" text,
	"idempotency_key" text NOT NULL,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "transfers_reference_unique" UNIQUE("reference"),
	CONSTRAINT "transfers_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "transfer_status_history" ADD CONSTRAINT "transfer_status_history_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE no action ON UPDATE no action;