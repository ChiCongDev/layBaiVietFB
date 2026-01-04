# Facebook Group Crawler - NestJS

Ứng dụng NestJS để crawl bài viết từ Facebook Group và lưu vào MySQL.

## 📋 Yêu cầu

- Node.js >= 18
- MySQL >= 8.0
- Tài khoản Facebook (để đăng nhập crawl)

## 🚀 Cài đặt

### 1. Clone và cài đặt dependencies

```bash
cd facebook-crawler
npm install
```

### 2. Tạo database MySQL

```bash
mysql -u root -p < database/init.sql
```

Hoặc chạy lệnh SQL:

```sql
CREATE DATABASE facebook_crawler CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Cấu hình môi trường

Copy file `.env.example` thành `.env` và điền thông tin:

```bash
cp .env.example .env
```

Chỉnh sửa file `.env`:

```env
# Database (XAMPP)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=
DB_DATABASE=crawl_facebook

# Facebook - Cách 1: Dùng email/password
FB_EMAIL=your_facebook_email
FB_PASSWORD=your_facebook_password

# Facebook - Cách 2: Dùng cookies (an toàn hơn)
FB_COOKIES=[{"name":"c_user","value":"xxx",...}]

# Group URL
FB_GROUP_URL=https://www.facebook.com/groups/5375930115830753

# Config
CRAWL_LIMIT=10
HEADLESS=true
```

### 4. Lấy Facebook Cookies (Khuyên dùng)

1. Cài extension **EditThisCookie** hoặc **Cookie Editor** trên Chrome
2. Đăng nhập Facebook
3. Click vào extension > Export > Copy
4. Paste vào `FB_COOKIES` trong file `.env`

### 5. Chạy ứng dụng

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## 📡 API Endpoints

### Crawl bài viết mới

```http
GET /facebook/crawl?limit=10
GET /facebook/crawl?groupUrl=https://facebook.com/groups/xxx&limit=10
```

### Lấy danh sách bài viết

```http
GET /facebook/posts?page=1&limit=20
```

### Tìm kiếm bài viết

```http
GET /facebook/posts/search?keyword=liên quân&page=1
```

### Lấy chi tiết bài viết

```http
GET /facebook/posts/:id
```

### Lấy thống kê

```http
GET /facebook/statistics
```

### Xóa bài viết

```http
DELETE /facebook/posts/:id
```

## 📁 Cấu trúc project

```
facebook-crawler/
├── src/
│   ├── entities/
│   │   └── facebook-post.entity.ts    # Entity cho TypeORM
│   ├── facebook/
│   │   ├── facebook.module.ts         # Module
│   │   ├── facebook.service.ts        # Business logic
│   │   ├── facebook.controller.ts     # API endpoints
│   │   └── facebook-crawler.service.ts # Puppeteer crawler
│   ├── utils/
│   │   └── get-cookies.js             # Helper lấy cookies
│   ├── app.module.ts                  # Root module
│   └── main.ts                        # Entry point
├── database/
│   └── init.sql                       # SQL khởi tạo
├── .env.example
├── package.json
└── README.md
```

## ⚠️ Lưu ý quan trọng

### Rủi ro khi sử dụng

| Rủi ro | Mô tả |
|--------|-------|
| **Tài khoản bị khóa** | Facebook có thể phát hiện và khóa tài khoản |
| **Vi phạm ToS** | Web scraping vi phạm điều khoản của Facebook |
| **Không ổn định** | Facebook thay đổi UI thường xuyên |

### Khuyến nghị

1. **Dùng tài khoản phụ** - Không dùng tài khoản chính
2. **Crawl từ từ** - Đừng crawl quá nhiều/quá nhanh
3. **Dùng proxy** - Thay đổi IP nếu bị block
4. **Bật headless: false** - Để debug khi gặp lỗi

### Xử lý lỗi thường gặp

**1. Không đăng nhập được**
- Kiểm tra email/password
- Thử dùng cookies thay vì credentials
- Facebook có thể yêu cầu xác minh

**2. Không crawl được bài viết**
- Facebook thay đổi HTML structure
- Cần update selector trong `extractPosts()`

**3. Bị block IP**
- Dùng proxy
- Giảm tốc độ crawl
- Đợi vài giờ rồi thử lại

## 🔄 Auto Crawl (Optional)

Bỏ comment decorator `@Cron` trong `facebook.service.ts` để bật auto crawl:

```typescript
@Cron(CronExpression.EVERY_30_MINUTES)
async scheduledCrawl(): Promise<void> {
  // ...
}
```

## 📄 License

MIT
