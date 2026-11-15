CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "trip_messages_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"role" text NOT NULL,
	"content" text NOT NULL,
	"settings_update" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_messages_role_check" CHECK ("trip_messages"."role" in ('user', 'assistant', 'system'))
);
--> statement-breakpoint
CREATE TABLE "trip_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "trip_plans_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"start_date" date,
	"end_date" date,
	"days" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"place" jsonb,
	"start_date" date,
	"end_date" date,
	"hotel" text DEFAULT '' NOT NULL,
	"prefs" text DEFAULT '' NOT NULL,
	"hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conversation_context" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"guest_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_dates_check" CHECK ("trips"."start_date" is null or "trips"."end_date" is null or "trips"."start_date" <= "trips"."end_date")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"theme" text DEFAULT 'light' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_language_check" CHECK ("user_settings"."language" in ('ru', 'en')),
	CONSTRAINT "user_settings_theme_check" CHECK ("user_settings"."theme" in ('light', 'dark'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_lowercase_check" CHECK ("users"."username" = lower("users"."username"))
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_messages" ADD CONSTRAINT "trip_messages_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plans" ADD CONSTRAINT "trip_plans_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "trip_messages_trip_id_seq_idx" ON "trip_messages" USING btree ("trip_id","seq");--> statement-breakpoint
CREATE INDEX "trip_plans_trip_id_seq_idx" ON "trip_plans" USING btree ("trip_id","seq");--> statement-breakpoint
CREATE INDEX "trips_user_id_created_at_idx" ON "trips" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_user_id_guest_id_key" ON "trips" USING btree ("user_id","guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree ("username");