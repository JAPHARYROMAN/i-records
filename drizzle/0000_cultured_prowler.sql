CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`division_id` text,
	`branch_id` text,
	`record_id` text,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`snapshot` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_record_time` ON `audit_events` (`record_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_company_time` ON `audit_events` (`company_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`division_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branch_division_code` ON `branches` (`division_id`,`code`);--> statement-breakpoint
CREATE INDEX `branch_company` ON `branches` (`company_id`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`description` text NOT NULL,
	`closed_through` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_code_unique` ON `companies` (`code`);--> statement-breakpoint
CREATE TABLE `divisions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`profile` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `division_company_code` ON `divisions` (`company_id`,`code`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`division_id` text,
	`branch_id` text,
	`name` text NOT NULL,
	`document_type` text NOT NULL,
	`document_date` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`physical_location` text DEFAULT '' NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`uploaded_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_object_key_unique` ON `documents` (`object_key`);--> statement-breakpoint
CREATE INDEX `document_company_date` ON `documents` (`company_id`,`document_date`);--> statement-breakpoint
CREATE TABLE `expectations` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`division_id` text,
	`branch_id` text,
	`kind` text NOT NULL,
	`frequency` text NOT NULL,
	`start_date` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `expectation_company` ON `expectations` (`company_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`company_id` text,
	`division_id` text,
	`branch_id` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "membership_role" CHECK("memberships"."role" IN ('admin','recorder','reviewer','viewer'))
);
--> statement-breakpoint
CREATE INDEX `membership_email` ON `memberships` (`email`);--> statement-breakpoint
CREATE INDEX `membership_user` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`owner_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `record_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`document_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `record_document_unique` ON `record_documents` (`record_id`,`document_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`company_id` text NOT NULL,
	`division_id` text,
	`branch_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`business_date` text NOT NULL,
	`end_date` text,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'TZS' NOT NULL,
	`category` text NOT NULL,
	`purpose` text NOT NULL,
	`counterparty` text DEFAULT '' NOT NULL,
	`source_reference` text DEFAULT '' NOT NULL,
	`related_id` text,
	`counterparty_company_id` text,
	`details` text DEFAULT '{}' NOT NULL,
	`scope_snapshot` text NOT NULL,
	`no_activity` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`submitted_at` text,
	`approved_at` text,
	`approved_by` text,
	`supersedes_id` text,
	`correction_reason` text,
	`evidence_exception` text,
	`mutation_id` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`counterparty_company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "record_amount" CHECK("records"."amount_minor" >= 0 AND "records"."amount_minor" <= 900000000000000),
	CONSTRAINT "record_kind" CHECK("records"."kind" IN ('sale','purchase','expense','invoice','payment','collection')),
	CONSTRAINT "record_status_values" CHECK("records"."status" IN ('draft','submitted','returned','approved','superseded','voided')),
	CONSTRAINT "record_currency" CHECK("records"."currency" IN ('TZS','USD','KES','EUR','GBP')),
	CONSTRAINT "record_scope" CHECK("records"."branch_id" IS NULL OR "records"."division_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_number_unique` ON `records` (`number`);--> statement-breakpoint
CREATE INDEX `record_company_date` ON `records` (`company_id`,`business_date`);--> statement-breakpoint
CREATE INDEX `record_status` ON `records` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_live_correction` ON `records` (`supersedes_id`) WHERE "records"."status" != 'voided';