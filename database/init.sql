-- Tạo database
CREATE DATABASE IF NOT EXISTS crawl_facebook
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE crawl_facebook;

-- Tạo bảng facebook_posts (TypeORM sẽ tự tạo, nhưng có sẵn để tham khảo)
CREATE TABLE IF NOT EXISTS facebook_posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id VARCHAR(255) NOT NULL UNIQUE,
    group_id VARCHAR(255),
    group_name VARCHAR(500),
    author_name VARCHAR(255),
    author_profile_url TEXT,
    content TEXT,
    post_url TEXT,
    image_urls JSON,
    likes_count INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    shares_count INT DEFAULT 0,
    posted_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_post_id (post_id),
    INDEX idx_group_id (group_id),
    INDEX idx_created_at (created_at),
    FULLTEXT INDEX idx_content (content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Một số query hữu ích

-- Lấy 10 bài mới nhất
-- SELECT * FROM facebook_posts ORDER BY created_at DESC LIMIT 10;

-- Tìm kiếm bài viết theo nội dung
-- SELECT * FROM facebook_posts WHERE MATCH(content) AGAINST('từ khóa' IN NATURAL LANGUAGE MODE);

-- Thống kê theo ngày
-- SELECT DATE(created_at) as date, COUNT(*) as total 
-- FROM facebook_posts 
-- GROUP BY DATE(created_at) 
-- ORDER BY date DESC;

-- Top bài viết nhiều like nhất
-- SELECT * FROM facebook_posts ORDER BY likes_count DESC LIMIT 10;
