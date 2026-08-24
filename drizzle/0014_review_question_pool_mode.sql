ALTER TABLE `reviews` ADD `question_pool_mode` text NOT NULL DEFAULT 'expanded' CHECK (`question_pool_mode` IN ('core', 'expanded'));
