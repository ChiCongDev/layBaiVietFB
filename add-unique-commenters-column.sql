-- Thêm column unique_commenters_count vào table facebook_posts
USE crawl_facebook;

ALTER TABLE facebook_posts
ADD COLUMN unique_commenters_count INT DEFAULT 0 AFTER comments_count;

-- Kiểm tra
DESCRIBE facebook_posts;
