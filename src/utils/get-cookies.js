/**
 * HƯỚNG DẪN LẤY FACEBOOK COOKIES
 * 
 * Cách 1: Dùng Browser Extension (Khuyên dùng)
 * --------------------------------------------
 * 1. Cài extension "EditThisCookie" hoặc "Cookie Editor" trên Chrome/Firefox
 * 2. Đăng nhập Facebook trên browser
 * 3. Mở extension, click "Export" để copy cookies dạng JSON
 * 4. Paste vào file .env ở biến FB_COOKIES
 * 
 * 
 * Cách 2: Dùng DevTools
 * ---------------------
 * 1. Đăng nhập Facebook
 * 2. Mở DevTools (F12)
 * 3. Vào tab Application (Chrome) hoặc Storage (Firefox)
 * 4. Chọn Cookies > https://www.facebook.com
 * 5. Copy từng cookie hoặc chạy script bên dưới trong Console
 */

// Chạy script này trong Console của DevTools khi đang ở facebook.com
// Copy kết quả và paste vào FB_COOKIES trong .env

const exportCookies = () => {
  const cookies = document.cookie.split(';').map(cookie => {
    const [name, value] = cookie.trim().split('=');
    return {
      name,
      value,
      domain: '.facebook.com',
      path: '/',
      secure: true,
      httpOnly: false,
    };
  });

  console.log('Copy đoạn JSON này vào FB_COOKIES trong .env:');
  console.log(JSON.stringify(cookies));
  
  return cookies;
};

// Gọi hàm
// exportCookies();

/**
 * COOKIES QUAN TRỌNG CẦN CÓ:
 * - c_user: User ID
 * - xs: Session token
 * - datr: Browser identifier
 * - fr: Facebook tracking
 * 
 * Nếu thiếu cookies này, có thể không đăng nhập được
 */

module.exports = { exportCookies };
