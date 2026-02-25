-- Drop table cũ và để TypeORM tạo lại (MẤT DATA CŨ!)
USE crawl_facebook;

DROP TABLE IF EXISTS facebook_posts;

-- TypeORM sẽ tự động tạo lại table với schema mới khi server restart
