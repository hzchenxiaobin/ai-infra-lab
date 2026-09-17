CREATE TABLE `interview_notes` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `interview_notes_id` PRIMARY KEY(`id`)
);
