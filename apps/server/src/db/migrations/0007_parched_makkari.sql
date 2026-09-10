CREATE TABLE `problem_lists` (
	`id` varchar(128) NOT NULL,
	`title` varchar(500) NOT NULL,
	`url` varchar(500) NOT NULL DEFAULT '',
	`problem_ids` json NOT NULL,
	`content_hash` varchar(64) NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `problem_lists_id` PRIMARY KEY(`id`)
);
