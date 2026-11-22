CREATE TABLE `server_members` (
	`server_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`server_id`, `user_id`),
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `server_members_user_idx` ON `server_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `invites` ADD `note` text;--> statement-breakpoint
ALTER TABLE `invites` ADD `expires_at` text;--> statement-breakpoint
ALTER TABLE `invites` ADD `multi_use` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `invites` ADD `uses` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invites` ADD `server_id` text REFERENCES servers(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `invites` ADD `permissions` text;--> statement-breakpoint
CREATE INDEX `invites_server_idx` ON `invites` (`server_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `invite_id` integer;