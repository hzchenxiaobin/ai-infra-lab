CREATE TABLE `interview_reports` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`session_id` bigint NOT NULL,
	`user_id` bigint NOT NULL,
	`overall_grade` varchar(8),
	`evaluated_by` varchar(8),
	`report` text NOT NULL,
	`weak_points` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `interview_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_interview_report_session` UNIQUE(`session_id`)
);
--> statement-breakpoint
ALTER TABLE `interview_sessions` ADD `scope_knowledge_points` json;--> statement-breakpoint
INSERT INTO `interview_reports` (`session_id`, `user_id`, `overall_grade`, `evaluated_by`, `report`, `weak_points`, `created_at`)
SELECT `id`, `user_id`, `overall_grade`, `evaluated_by`, `report`, JSON_ARRAY(), COALESCE(`finished_at`, `created_at`)
FROM `interview_sessions`
WHERE `status` = 'finished' AND `report` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `interview_sessions` DROP COLUMN `evaluated_by`;--> statement-breakpoint
ALTER TABLE `interview_sessions` DROP COLUMN `report`;
