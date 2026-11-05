CREATE TABLE `bridge_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`event_name` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metadata_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallet_cache` (
	`address` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
