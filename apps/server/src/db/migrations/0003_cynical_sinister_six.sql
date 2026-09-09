CREATE TABLE `contents` (
	`id` varchar(128) NOT NULL,
	`type` enum('learn','problem','paper','profiling') NOT NULL,
	`title` varchar(500) NOT NULL,
	`tags` json NOT NULL,
	`knowledge_points` json NOT NULL,
	`url` varchar(500) NOT NULL DEFAULT '',
	`content_hash` varchar(64) NOT NULL,
	`status` enum('active','stale') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_verifications` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`code_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_points` (
	`id` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(50) NOT NULL,
	`description` text NOT NULL DEFAULT (''),
	CONSTRAINT `knowledge_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `oauth_identities` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`provider` varchar(32) NOT NULL,
	`provider_account_id` varchar(255) NOT NULL,
	`user_id` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `oauth_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_oauth_provider_account` UNIQUE(`provider`,`provider_account_id`)
);
--> statement-breakpoint
CREATE TABLE `problems` (
	`id` varchar(128) NOT NULL,
	`source` enum('leetcode','leetgpu','contest') NOT NULL,
	`number` int NOT NULL DEFAULT 0,
	`difficulty` enum('easy','medium','hard') NOT NULL,
	`languages` json NOT NULL,
	`judge_type` enum('internal','leetgpu-com','none') NOT NULL,
	`testcases` json NOT NULL,
	`external_url` varchar(500) NOT NULL DEFAULT '',
	CONSTRAINT `problems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`problem_id` varchar(128) NOT NULL,
	`language` varchar(32) NOT NULL,
	`code` text NOT NULL,
	`status` enum('pending','running','ac','wa','ce','tle','mle') NOT NULL DEFAULT 'pending',
	`verdict_detail` json,
	`runtime_ms` int,
	`memory_kb` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `usage_quotas` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`kind` enum('judge','interview') NOT NULL,
	`period` varchar(32) NOT NULL,
	`used` int NOT NULL DEFAULT 0,
	`quota` int,
	CONSTRAINT `usage_quotas_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_usage_quota` UNIQUE(`user_id`,`kind`,`period`)
);
--> statement-breakpoint
CREATE TABLE `user_progress` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`content_id` varchar(128) NOT NULL,
	`status` enum('unseen','seen','mastered','ac') NOT NULL DEFAULT 'unseen',
	`score` int,
	`last_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_progress_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_user_progress` UNIQUE(`user_id`,`content_id`)
);
--> statement-breakpoint
ALTER TABLE `questions` ADD `knowledge_points` json;--> statement-breakpoint
ALTER TABLE `users` ADD `email` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar` varchar(500);--> statement-breakpoint
ALTER TABLE `users` ADD `tier` enum('free','pro') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `problems` ADD CONSTRAINT `problems_id_contents_id_fk` FOREIGN KEY (`id`) REFERENCES `contents`(`id`) ON DELETE no action ON UPDATE no action;