-- Thêm column comments vào table facebook_posts
USE crawl_facebook;

ALTER TABLE facebook_posts
ADD COLUMN comments JSON NULL AFTER comments_count;

-- Kiểm tra
DESCRIBE facebook_posts;
