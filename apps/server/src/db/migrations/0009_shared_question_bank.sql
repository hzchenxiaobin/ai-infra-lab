ALTER TABLE `questions` MODIFY COLUMN `user_id` bigint;--> statement-breakpoint
-- 存量内置题（bank:/seed: 前缀）转为全站共享
UPDATE `questions` SET `user_id` = NULL WHERE `source_key` LIKE 'bank:%' OR `source_key` LIKE 'seed:%';
