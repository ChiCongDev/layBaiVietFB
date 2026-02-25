# Cách Lấy Cookies Mới Từ Facebook

## Bước 1: Đăng nhập Facebook trên Chrome/Edge
1. Mở Chrome/Edge
2. Vào https://www.facebook.com
3. Đăng nhập với tài khoản `tokota221@gmail.com`

## Bước 2: Cài Extension "Cookie-Editor" hoặc "EditThisCookie"
1. Vào Chrome Web Store
2. Tìm "Cookie-Editor"
3. Cài đặt extension

## Bước 3: Export Cookies
1. Vào trang Facebook đã đăng nhập
2. Click icon Cookie-Editor trên toolbar
3. Click "Export" -> chọn format "JSON"
4. Copy toàn bộ JSON

## Bước 4: Paste vào .env
1. Mở file `.env`
2. Tìm dòng `FB_COOKIES=...`
3. Thay thế bằng cookies mới vừa export
4. Format: `FB_COOKIES=[{...cookies...}]`

## Bước 5: Test
Sau khi có cookies mới, chạy:
```bash
curl "http://localhost:3000/facebook/crawl?limit=1"
```

---

## Hoặc Lấy Cookies Bằng DevTools (không cần extension)

1. Vào Facebook đã đăng nhập
2. Nhấn F12 (mở DevTools)
3. Vào tab **Application** -> **Cookies** -> `https://www.facebook.com`
4. Copy các cookies quan trọng:
   - `c_user`
   - `xs`
   - `datr`
   - `fr`
   - `sb`

5. Tạo JSON theo format:
```json
[
  {"name":"c_user","value":"...","domain":".facebook.com"},
  {"name":"xs","value":"...","domain":".facebook.com"},
  {"name":"datr","value":"...","domain":".facebook.com"},
  {"name":"fr","value":"...","domain":".facebook.com"}
]
```
