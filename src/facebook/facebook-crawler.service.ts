import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import { createWorker } from 'tesseract.js';

export interface CrawledPost {
  postId: string;
  groupId: string;
  groupName: string;
  authorName: string;
  authorProfileUrl: string;
  content: string;
  postUrl: string;
  imageUrls: string[];
  likesCount: number;
  commentsCount: number;
  uniqueCommentersCount: number;
  comments: Array<{
    author: string;
    content: string;
    timestamp: string;
  }>;
  sharesCount: number;
  postedAt: Date;
}

@Injectable()
export class FacebookCrawlerService {
  private readonly logger = new Logger(FacebookCrawlerService.name);
  private browser: Browser;

  constructor(private configService: ConfigService) {}

  private getBrowserPath(): string {
    const customPath = this.configService.get('BROWSER_PATH');
    if (customPath) {
      return customPath;
    }
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }

  async initBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    const browserPath = this.getBrowserPath();
    this.logger.log(`Đang khởi tạo browser từ: ${browserPath}`);

    this.browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: this.configService.get('HEADLESS', 'true') === 'true',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--lang=vi-VN',
      ],
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    });

    return this.browser;
  }

  async loginWithCredentials(page: Page): Promise<boolean> {
    const email = this.configService.get('FB_EMAIL');
    const password = this.configService.get('FB_PASSWORD');

    if (!email || !password) {
      this.logger.error('Thiếu FB_EMAIL hoặc FB_PASSWORD trong .env');
      return false;
    }

    try {
      this.logger.log('Đang đăng nhập Facebook...');

      // Thử URL chính thức của Facebook thay vì /login
      await page.goto('https://www.facebook.com', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      await this.delay(3000);

      // Screenshot để debug
      try {
        await page.screenshot({ path: 'debug-login-page.png' });
        this.logger.log('Đã chụp screenshot: debug-login-page.png');
      } catch (e) {}

      // Thử nhiều selector khác nhau cho email input
      const emailSelectors = [
        '#email',
        'input[name="email"]',
        'input[type="text"]',
        'input[placeholder*="Email"]',
        'input[placeholder*="email"]',
        'input[placeholder*="số điện thoại"]',
        'input[placeholder*="phone"]',
        'input[id*="email"]',
        'input[data-testid*="email"]',
      ];

      let emailInput = null;
      let usedEmailSelector = '';

      this.logger.log('Đang tìm input email...');
      for (const selector of emailSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          emailInput = await page.$(selector);
          if (emailInput) {
            usedEmailSelector = selector;
            this.logger.log(`Tìm thấy email input với selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Thử selector tiếp theo
        }
      }

      if (!emailInput) {
        this.logger.error('Không tìm thấy input email');
        await page.screenshot({ path: 'debug-no-email-input.png' });
        return false;
      }

      // Nhập email
      await emailInput.type(email, { delay: 100 });
      this.logger.log('Đã nhập email');

      await this.delay(1000);

      // Thử nhiều selector cho password
      const passwordSelectors = [
        '#pass',
        'input[name="pass"]',
        'input[type="password"]',
        'input[placeholder*="Mật khẩu"]',
        'input[placeholder*="Password"]',
        'input[id*="pass"]',
      ];

      let passwordInput = null;
      for (const selector of passwordSelectors) {
        try {
          passwordInput = await page.$(selector);
          if (passwordInput) {
            this.logger.log(`Tìm thấy password input với selector: ${selector}`);
            break;
          }
        } catch (e) {}
      }

      if (!passwordInput) {
        this.logger.error('Không tìm thấy input password');
        return false;
      }

      // Nhập password
      await passwordInput.type(password, { delay: 100 });
      this.logger.log('Đã nhập password');

      await this.delay(1000);

      // Thử nhiều selector cho nút login
      const loginBtnSelectors = [
        'button[name="login"]',
        'button[type="submit"]',
        'button[data-testid*="royal_login_button"]',
        'button[value="1"][type="submit"]',
        'input[type="submit"]',
        'div[aria-label="Đăng nhập"]',
        'div[aria-label="Log in"]',
      ];

      let loginBtn = null;
      for (const selector of loginBtnSelectors) {
        try {
          loginBtn = await page.$(selector);
          if (loginBtn) {
            this.logger.log(`Tìm thấy nút login với selector: ${selector}`);
            break;
          }
        } catch (e) {}
      }

      // Thử submit form thay vì click button (an toàn hơn)
      this.logger.log('Đang submit form đăng nhập...');

      try {
        // Cách 1: Submit form trực tiếp
        await page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) {
            form.submit();
            return true;
          }
          return false;
        });

        this.logger.log('Đã submit form');
      } catch (e) {
        // Cách 2: Click bằng JavaScript (bypass clickable check)
        this.logger.log('Thử click bằng JavaScript...');
        try {
          await page.evaluate(() => {
            const loginButtons = [
              document.querySelector('button[name="login"]'),
              document.querySelector('button[type="submit"]'),
              document.querySelector('input[type="submit"]'),
              document.querySelector('button[data-testid*="royal_login_button"]'),
            ];

            for (const btn of loginButtons) {
              if (btn) {
                (btn as HTMLElement).click();
                return true;
              }
            }
            return false;
          });
        } catch (e2) {
          this.logger.error('Không thể submit/click login');
          return false;
        }
      }

      // Đợi lâu hơn để Facebook xử lý đăng nhập
      await this.delay(8000);

      const currentUrl = page.url();
      this.logger.log(`URL sau khi đăng nhập: ${currentUrl}`);

      if (currentUrl.includes('login') || currentUrl.includes('checkpoint')) {
        this.logger.error('Đăng nhập thất bại hoặc cần xác minh');
        await page.screenshot({ path: 'debug-login-failed.png' });
        return false;
      }

      this.logger.log('Đăng nhập thành công!');
      await page.screenshot({ path: 'debug-login-success.png' });
      return true;
    } catch (error) {
      this.logger.error('Lỗi đăng nhập:', error.message);
      try {
        await page.screenshot({ path: 'debug-login-error.png' });
      } catch (e) {}
      return false;
    }
  }

  async handleLoginPopup(page: Page): Promise<boolean> {
    const email = this.configService.get('FB_EMAIL');
    const password = this.configService.get('FB_PASSWORD');

    try {
      const popupSelectors = [
        'input[name="email"]',
        'input[placeholder*="Email"]',
        'input[placeholder*="email"]',
        'input[placeholder*="điện thoại"]',
      ];

      let emailInput = null;
      for (const selector of popupSelectors) {
        emailInput = await page.$(selector);
        if (emailInput) break;
      }

      if (!emailInput) {
        return true;
      }

      this.logger.log('Phát hiện popup đăng nhập, đang xử lý...');

      await emailInput.type(email, { delay: 50 });

      const passwordSelectors = [
        'input[name="pass"]',
        'input[type="password"]',
        'input[placeholder*="Mật khẩu"]',
      ];

      for (const selector of passwordSelectors) {
        const passInput = await page.$(selector);
        if (passInput) {
          await passInput.type(password, { delay: 50 });
          break;
        }
      }

      const loginBtnSelectors = [
        'button[name="login"]',
        'button[type="submit"]',
        'div[aria-label="Đăng nhập"]',
      ];

      for (const selector of loginBtnSelectors) {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click();
          break;
        }
      }

      await this.delay(5000);
      this.logger.log('Đã xử lý popup đăng nhập');
      return true;
    } catch (error) {
      this.logger.error('Lỗi xử lý popup:', error.message);
      return false;
    }
  }

  async loginWithCookies(page: Page): Promise<boolean> {
    const cookiesString = this.configService.get('FB_COOKIES');

    if (!cookiesString) {
      this.logger.warn('Không có FB_COOKIES, sẽ thử đăng nhập bằng credentials');
      return false;
    }

    try {
      this.logger.log('Đang đăng nhập bằng cookies...');
      let cookies = JSON.parse(cookiesString);

      // Fix cookies: Xóa cookies có sameSite null hoặc invalid
      cookies = cookies.map(cookie => {
        // Nếu sameSite là null, xóa field đó
        if (cookie.sameSite === null || cookie.sameSite === undefined) {
          delete cookie.sameSite;
        }
        // Xóa các field không cần thiết cho Puppeteer
        delete cookie.storeId;
        delete cookie.hostOnly;
        return cookie;
      });

      this.logger.log(`Đang set ${cookies.length} cookies...`);
      await page.setCookie(...cookies);

      await page.goto('https://www.facebook.com', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      const loginButton = await page.$('[data-testid="royal_login_button"]');
      if (loginButton) {
        this.logger.warn('Cookies hết hạn hoặc không hợp lệ');
        return false;
      }

      this.logger.log('Đăng nhập bằng cookies thành công!');
      return true;
    } catch (error) {
      this.logger.error('Lỗi đăng nhập bằng cookies:', error.message);
      return false;
    }
  }

  async autoScroll(page: Page, scrollCount: number = 5): Promise<void> {
    this.logger.log(`Đang scroll để load ${scrollCount} lần...`);

    let previousArticleCount = 0;
    let noNewArticlesCount = 0;

    for (let i = 0; i < scrollCount; i++) {
      try {
        await page.evaluate(() => {
          const closeButtons = document.querySelectorAll('[aria-label="Close"], [aria-label="Đóng"], [role="button"][aria-label*="close"]');
          closeButtons.forEach(btn => (btn as HTMLElement).click());

          const overlays = document.querySelectorAll('[role="dialog"], [data-testid="dialog_root"]');
          overlays.forEach(el => (el as HTMLElement).style.display = 'none');
        });
      } catch (e) {}

      // Scroll nhỏ từng bước thay vì scroll lớn một lần
      await page.evaluate(() => {
        const scrollStep = Math.floor(window.innerHeight / 3);
        for (let j = 0; j < 6; j++) {
          window.scrollBy(0, scrollStep);
        }
      });

      // Đợi lâu hơn để Facebook load content
      await this.delay(3000 + Math.random() * 2000);

      // Kiểm tra số lượng articles mới
      const currentArticleCount = await page.evaluate(() => {
        return document.querySelectorAll('[role="article"]').length;
      });

      this.logger.debug(`Scroll ${i + 1}/${scrollCount} - Articles: ${currentArticleCount}`);

      // Nếu không có article mới sau 3 lần scroll, dừng lại
      if (currentArticleCount === previousArticleCount) {
        noNewArticlesCount++;
        if (noNewArticlesCount >= 3) {
          this.logger.log('Không còn bài viết mới để load, dừng scroll');
          break;
        }
      } else {
        noNewArticlesCount = 0;
      }

      previousArticleCount = currentArticleCount;
    }

    this.logger.log(`Tổng số articles sau khi scroll: ${previousArticleCount}`);
  }

  /**
   * Visit một post cụ thể và extract full data (để check unique commenters)
   */
  async visitPostAndEnrich(post: CrawledPost): Promise<CrawledPost | null> {
    try {
      const browser = await this.initBrowser();
      const page = await browser.newPage();

      // Capture console logs - bắt tất cả để debug
      page.on('console', (msg) => {
        const text = msg.text();
        if (text && text.length > 0 && text.length < 5000) {
          this.logger.debug(`[Browser Console] ${text}`);
        }
      });

      // Đăng nhập bằng cookies
      await this.loginWithCookies(page);

      // Extract full data từ post URL
      const fullData = await this.extractFullPostData(page, post.postUrl);

      this.logger.debug(`Unique commenters: ${fullData.uniqueCommentersCount} (from ${fullData.comments.length} comments)`);

      // Merge data
      return {
        ...post,
        content: fullData.content || post.content,
        imageUrls: fullData.imageUrls.length > 0 ? fullData.imageUrls : post.imageUrls,
        likesCount: fullData.likesCount,
        commentsCount: fullData.commentsCount,
        uniqueCommentersCount: fullData.uniqueCommentersCount,
        comments: fullData.comments,
        sharesCount: fullData.sharesCount,
      };
    } catch (error) {
      this.logger.error(`Lỗi khi visit post ${post.postUrl}:`, error.message);
      return null;
    }
  }

  async crawlGroupPosts(groupUrl: string, limit: number = 10): Promise<CrawledPost[]> {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    // Capture console logs từ browser - bắt tất cả để không bỏ sót
    page.on('console', msg => {
      const text = msg.text();
      if (text && text.length > 0 && text.length < 5000) {
        this.logger.debug(`[Browser Console] ${text}`);
      }
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    try {
      let loggedIn = await this.loginWithCookies(page);
      if (!loggedIn) {
        loggedIn = await this.loginWithCredentials(page);
      }

      if (!loggedIn) {
        throw new Error('Không thể đăng nhập Facebook');
      }

      this.logger.log(`Đang truy cập group: ${groupUrl}`);
      await page.goto(groupUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      await this.delay(3000);

      // Screenshot sau khi vào group để debug
      try {
        await page.screenshot({ path: 'debug-after-goto-group.png', fullPage: true });
        this.logger.log('Đã chụp screenshot trang group: debug-after-goto-group.png');
      } catch (e) {}

      await this.handleLoginPopup(page);
      await this.delay(3000);

      // Đóng tất cả popup/overlay bằng JavaScript
      try {
        this.logger.log('Đang xóa popup/overlay...');
        await page.evaluate(() => {
          // Xóa tất cả role="dialog" (popup)
          const dialogs = document.querySelectorAll('[role="dialog"]');
          dialogs.forEach(el => el.remove());

          // Xóa tất cả overlay/backdrop
          const overlays = document.querySelectorAll('[data-pagelet*="root"], [data-testid="dialog_root"]');
          overlays.forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' || style.position === 'absolute') {
              el.remove();
            }
          });

          // Xóa element có z-index cao (thường là popup)
          const allElements = document.querySelectorAll('*');
          allElements.forEach(el => {
            const style = window.getComputedStyle(el);
            const zIndex = parseInt(style.zIndex);
            if (zIndex > 1000 && (style.position === 'fixed' || style.position === 'absolute')) {
              el.remove();
            }
          });
        });
        this.logger.log('Đã xóa popup/overlay');
      } catch (e) {
        this.logger.warn('Không thể xóa popup:', e.message);
      }

      await this.delay(2000);

      // Thử click nút X nếu còn
      try {
        const closeButtons = await page.$$('[aria-label="Close"], [aria-label="Đóng"], div[aria-label="Close"]');
        for (const btn of closeButtons) {
          await btn.click();
          await this.delay(500);
        }
      } catch (e) {}

      // TẠM THỜI BỎ CLICK TAB DISCUSSION - Gây trang trống
      // Tab mặc định thường đã hiển thị bài viết
      this.logger.log('Bỏ qua click tab Discussion, dùng tab mặc định');
      await this.delay(3000);

      // Reload trang nếu cần (đảm bảo đã đăng nhập đúng)
      const currentUrl = page.url();
      if (!currentUrl.includes('facebook.com/groups')) {
        this.logger.log('Đang reload trang group...');
        await page.goto(groupUrl, {
          waitUntil: 'networkidle2',
          timeout: 60000,
        });
        await this.delay(5000);
      }



      // CHIẾN LƯỢC MỚI: Extract posts TRONG LÚC scroll để tránh Facebook xóa DOM
      const groupId = this.extractGroupId(groupUrl);
      const allPosts: CrawledPost[] = [];
      const seenPostIds = new Set<string>();

      this.logger.log('Bắt đầu scroll và extract posts...');

      // DEBUG: Xem có bao nhiêu images trong TOÀN BỘ page
      const totalImagesDebug = await page.evaluate(() => {
        const allImgs = document.querySelectorAll('img');
        const imgSources = Array.from(allImgs).map(img => (img as HTMLImageElement).src).filter(src => src && src.includes('scontent'));
        console.log(`=== DEBUG: Total IMG tags in page: ${allImgs.length}`);
        console.log(`=== DEBUG: Images with scontent: ${imgSources.length}`);
        if (imgSources.length > 0) {
          console.log(`=== DEBUG: Sample image URLs:`);
          imgSources.slice(0, 3).forEach((src, i) => console.log(`  ${i + 1}. ${src.substring(0, 100)}`));
        }
        return { total: allImgs.length, scontent: imgSources.length, samples: imgSources.slice(0, 3) };
      });
      this.logger.debug(`Page has ${totalImagesDebug.total} img tags total, ${totalImagesDebug.scontent} with scontent`);

      // Scroll và extract từng đợt
      // Không giới hạn số lần scroll theo limit - chạy đến khi đủ bài hoặc hết bài mới
      let noNewPostsCount = 0;
      const maxNoNewPosts = 8; // Dừng sau 8 lần scroll liên tiếp không phát hiện bài mới nào
      for (let scrollIndex = 0; scrollIndex < 10000; scrollIndex++) {
        const prevLength = allPosts.length;
        const prevSeenCount = seenPostIds.size;

        // Scroll một chút
        try {
          await page.evaluate(() => {
            const closeButtons = document.querySelectorAll('[aria-label="Close"], [aria-label="Đóng"]');
            closeButtons.forEach(btn => (btn as HTMLElement).click());
          });
        } catch (e) {}

        await page.evaluate(() => {
          const scrollStep = Math.floor(window.innerHeight / 3);
          for (let j = 0; j < 6; j++) {
            window.scrollBy(0, scrollStep);
          }
        });

        // QUAN TRỌNG: Đợi LÂU HƠN để images load
        await this.delay(5000 + Math.random() * 2000);

        // Đợi images lazy load
        await page.evaluate(() => {
          return new Promise(resolve => {
            setTimeout(() => {
              // Trigger lazy loading bằng cách scroll lên xuống một chút
              window.scrollBy(0, -100);
              setTimeout(() => {
                window.scrollBy(0, 100);
                resolve(true);
              }, 500);
            }, 1000);
          });
        });

        // Extract posts hiện tại
        const extractLimit = limit >= 10000 ? 500 : limit * 2;
        const newPosts = await this.extractPosts(page, groupUrl, extractLimit);

        // Thêm vào danh sách
        for (const post of newPosts) {
          // Real ID = chỉ chứa số (từ permalink), random ID = bắt đầu bằng "post_"
          const isRealId = /^\d+$/.test(post.postId);

          if (isRealId) {
            // Bài có permalink: track vào seenPostIds kể cả khi không có content
            // → tránh bị re-check lại mỗi scroll, fix false early-stop
            if (!seenPostIds.has(post.postId)) {
              seenPostIds.add(post.postId);
              if (post.content !== '[No content]') {
                allPosts.push(post);
                this.logger.debug(`✓ Extracted: ${post.authorName} - ${post.content.substring(0, 50)}...`);
              }
            }
          } else {
            // Bài không có permalink (random ID): chỉ thêm nếu có content
            if (post.content !== '[No content]') {
              allPosts.push(post);
              this.logger.debug(`✓ Extracted (no-permalink): ${post.authorName} - ${post.content.substring(0, 50)}...`);
            }
          }
        }

        // newRealSeen: số bài có real permalink MỚI phát hiện lần này
        // Dùng để detect hết feed, không dùng newAdded (để tránh bị dừng do bài [No content])
        const newRealSeen = seenPostIds.size - prevSeenCount;
        const newAdded = allPosts.length - prevLength;
        this.logger.debug(`Scroll ${scrollIndex + 1} - New articles seen: ${newRealSeen}, Added: ${newAdded}, Total: ${allPosts.length}${limit < 10000 ? '/' + limit : ''}`);

        // Dừng nếu đã đủ
        if (allPosts.length >= limit) {
          this.logger.log(`Đã đủ ${limit} bài viết, dừng scroll`);
          break;
        }

        // Dừng khi không phát hiện thêm bài nào có real permalink nhiều lần liên tiếp
        // (tức là feed đã hết, không còn bài mới để load)
        if (newRealSeen === 0) {
          noNewPostsCount++;
          this.logger.debug(`Không có bài permalink mới (${noNewPostsCount}/${maxNoNewPosts})`);
          if (noNewPostsCount >= maxNoNewPosts) {
            this.logger.log(`Không còn bài mới sau ${maxNoNewPosts} lần cuộn liên tiếp, dừng lại (đã lấy ${allPosts.length} bài)`);
            break;
          }
        } else {
          noNewPostsCount = 0;
        }
      }

      // Screenshot cuối để debug
      try {
        await page.screenshot({ path: 'debug-after-scroll.png', fullPage: true });
        this.logger.log('Đã chụp screenshot: debug-after-scroll.png');
      } catch (e) {}

      let posts = allPosts.slice(0, limit);
      this.logger.log(`Đã thu thập ${posts.length} post URLs`);

      // Đảo ngược thứ tự: group feed hiện newest first
      // → Reverse để process từ bài CŨ NHẤT (cuối feed) đến bài MỚI NHẤT (đầu feed)
      posts = posts.reverse();
      this.logger.log(`↩️ Đã đảo thứ tự: xử lý từ bài cũ → mới (${posts.length} bài)`);

      // BƯỚC 2: Visit từng post để lấy images và stats
      this.logger.log('Bắt đầu visit từng post để lấy full data...');
      const enrichedPosts: CrawledPost[] = [];

      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        if (!post.postUrl) {
          this.logger.warn(`Post ${i + 1}/${posts.length}: Không có URL, bỏ qua`);
          enrichedPosts.push(post);
          continue;
        }

        try {
          this.logger.log(`Visiting post ${i + 1}/${posts.length}: ${post.postUrl.substring(0, 80)}...`);

          const fullData = await this.extractFullPostData(page, post.postUrl);

          this.logger.debug(`✓ Unique commenters: ${fullData.uniqueCommentersCount} (from aria-labels in full document)`);

          // Merge data
          enrichedPosts.push({
            ...post,
            imageUrls: fullData.imageUrls.length > 0 ? fullData.imageUrls : post.imageUrls,
            likesCount: fullData.likesCount > 0 ? fullData.likesCount : post.likesCount,
            commentsCount: fullData.commentsCount > 0 ? fullData.commentsCount : post.commentsCount,
            uniqueCommentersCount: fullData.uniqueCommentersCount,
            comments: fullData.comments || [],
            sharesCount: fullData.sharesCount > 0 ? fullData.sharesCount : post.sharesCount,
            content: fullData.content && fullData.content !== '[No content]' ? fullData.content : post.content,
          });

          this.logger.debug(`✓ Post ${i + 1}: images=${fullData.imageUrls.length}, likes=${fullData.likesCount}, comments=${fullData.commentsCount}, actualComments=${fullData.comments.length}`);

          // Delay giữa các requests
          await this.delay(2000);
        } catch (error) {
          this.logger.warn(`Lỗi khi visit post ${i + 1}: ${error.message}`);
          enrichedPosts.push(post);
        }
      }

      this.logger.log(`Đã enriched ${enrichedPosts.length} bài viết`);
      return enrichedPosts;
    } catch (error) {
      this.logger.error('Lỗi crawl:', error.message);
      throw error;
    } finally {
      await page.close();
    }
  }

  private async extractPosts(page: Page, groupUrl: string, limit: number): Promise<CrawledPost[]> {
    const groupId = this.extractGroupId(groupUrl);

    // Debug: log số lượng elements tìm được
    const debugInfo = await page.evaluate(() => {
      const selectors = [
        '[role="article"]',
        'div[data-pagelet*="FeedUnit"]',
        'div[data-pagelet*="GroupFeed"]',
        'div[data-pagelet*="feed"]',
      ];
      return selectors.map(sel => ({
        selector: sel,
        count: document.querySelectorAll(sel).length
      }));
    });

    this.logger.debug('Debug selectors:', JSON.stringify(debugInfo));

    // THÊM: Dump toàn bộ page structure để tìm selector mới
    const pageStructure = await page.evaluate(() => {
      // Tìm tất cả divs có data-pagelet attribute
      const pagelets = Array.from(document.querySelectorAll('[data-pagelet]'));
      const pageletInfo = pagelets.map(el => ({
        tagName: el.tagName,
        pagelet: el.getAttribute('data-pagelet'),
        children: el.children.length,
        textLength: (el.textContent || '').length
      }));

      // Tìm các divs lớn có nhiều text (có thể là feed container)
      const largeDivs = Array.from(document.querySelectorAll('div'))
        .filter(div => {
          const text = (div.textContent || '').trim();
          return text.length > 100 && text.length < 50000 && div.children.length > 5;
        })
        .slice(0, 10)
        .map(div => ({
          id: div.id,
          className: div.className.substring(0, 50),
          childrenCount: div.children.length,
          textLength: (div.textContent || '').length,
          hasDataPagelet: !!div.getAttribute('data-pagelet'),
          dataPagelet: div.getAttribute('data-pagelet')
        }));

      return {
        pagelets: pageletInfo,
        largeDivs: largeDivs,
        totalDivs: document.querySelectorAll('div').length,
        totalArticles: document.querySelectorAll('[role="article"]').length
      };
    });

    this.logger.debug('=== PAGE STRUCTURE DUMP ===');
    this.logger.debug(`Total divs: ${pageStructure.totalDivs}, articles: ${pageStructure.totalArticles}`);
    this.logger.debug(`Pagelets (${pageStructure.pagelets.length}):`, JSON.stringify(pageStructure.pagelets.slice(0, 20), null, 2));
    this.logger.debug(`Large divs (${pageStructure.largeDivs.length}):`, JSON.stringify(pageStructure.largeDivs, null, 2));

    const posts = await page.evaluate((groupId: string, limit: number) => {
      const results: any[] = [];

      // Chỉ dùng selector đơn giản nhất
      const postElements = Array.from(document.querySelectorAll('[role="article"]'));

      console.log(`Total post elements: ${postElements.length}`);

      // DEBUG: Xem cấu trúc của article đầu tiên
      if (postElements.length > 0) {
        const firstPost = postElements[0];
        const allDescendants = firstPost.querySelectorAll('*');
        const imgCount = firstPost.querySelectorAll('img').length;
        const divWithBgCount = Array.from(firstPost.querySelectorAll('div')).filter(div => {
          const style = (div as HTMLElement).style.backgroundImage;
          return style && style.includes('url');
        }).length;

        console.log(`=== First article structure:`);
        console.log(`  Total descendants: ${allDescendants.length}`);
        console.log(`  IMG tags: ${imgCount}`);
        console.log(`  Divs with background-image: ${divWithBgCount}`);
        console.log(`  [role="img"] elements: ${firstPost.querySelectorAll('[role="img"]').length}`);
        console.log(`  [data-visualcompletion] elements: ${firstPost.querySelectorAll('[data-visualcompletion*="media"]').length}`);

        // Log HTML snippet
        const htmlSnippet = firstPost.innerHTML.substring(0, 500);
        console.log(`  HTML snippet: ${htmlSnippet}`);
      }

      for (let i = 0; i < Math.min(postElements.length, limit * 3); i++) {
        const post = postElements[i];

        try {
          // === STRATEGY: Extract ALL text, links, images - then filter ===

          // Dùng innerText thay vì textContent để có line breaks đúng giữa các elements
          const allText = (post as HTMLElement).innerText || post.textContent || '';
          const allLinks = Array.from(post.querySelectorAll('a'));

          // THAY ĐỔI: Tìm images trong TOÀN BỘ article và children (bao gồm shadow DOM)
          const allImages: HTMLImageElement[] = [];

          // Cách 1: Tìm tất cả img tags trong article
          post.querySelectorAll('img').forEach(img => allImages.push(img as HTMLImageElement));

          // Cách 2: Tìm images trong các div con có thể chứa ảnh
          const imageDivs = post.querySelectorAll('[role="img"], [data-visualcompletion="media-vc-image"], div[style*="background-image"]');
          imageDivs.forEach(div => {
            div.querySelectorAll('img').forEach(img => allImages.push(img as HTMLImageElement));

            // Check background image
            const bgStyle = (div as HTMLElement).style.backgroundImage;
            if (bgStyle) {
              const urlMatch = bgStyle.match(/url\(['"]?(.*?)['"]?\)/);
              if (urlMatch && urlMatch[1]) {
                const fakeImg = document.createElement('img');
                fakeImg.src = urlMatch[1];
                allImages.push(fakeImg as HTMLImageElement);
              }
            }
          });

          // Extract Post ID & URL
          let postId = '';
          let postUrl = '';
          for (const link of allLinks) {
            const href = link.href || '';
            const match = href.match(/\/posts\/(\d+)|permalink\/(\d+)|story_fbid=(\d+)/);
            if (match) {
              postId = match[1] || match[2] || match[3];
              postUrl = href;
              break;
            }
          }
          if (!postId) {
            postId = `post_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`;
          }

          // Extract Author Name & Profile URL
          let authorName = 'Unknown';
          let authorProfileUrl = '';

          // Tìm link đầu tiên có text và là profile link
          for (const link of allLinks.slice(0, 20)) {
            const href = link.href || '';
            const text = (link.textContent || '').trim();

            if (text.length >= 2 && text.length <= 60 &&
                (href.includes('/user/') || href.includes('/profile.php?id=') ||
                 (href.match(/facebook\.com\/[a-zA-Z0-9.]+\?/) && !href.includes('/groups/'))) &&
                !href.includes('/photo') &&
                !href.includes('/posts/') &&
                !href.includes('/video') &&
                !text.match(/^(Like|Comment|Share|Photo|Video|See)/i)) {
              authorName = text;
              authorProfileUrl = href.split('?')[0]; // Remove query params
              break;
            }
          }

          // Fallback: Tìm strong/span đầu tiên
          if (authorName === 'Unknown') {
            const possibleNames = post.querySelectorAll('strong, h2, h3, h4');
            for (const elem of possibleNames) {
              const text = (elem.textContent || '').trim();
              if (text.length >= 2 && text.length <= 60 &&
                  !text.match(/^(Like|Comment|Share|See|Public|Private|Group)/i)) {
                authorName = text;
                break;
              }
            }
          }

          // Extract Content - ĐƠN GIẢN HÓA
          let content = '';

          // Lấy text dài nhất, lọc những dòng RÕ RÀNG là UI
          const textLines = allText.split('\n')
            .map(l => l.trim())
            .filter(l => {
              // Chỉ bỏ những dòng RÕ RÀNG là UI
              if (l.length < 3) return false;
              if (l === authorName) return false;
              if (l.match(/^(Like|Comment|Share|Reply|Follow|Hide|Save|Report|Delete|Edit|Write a comment|LikeReply|LikeComment|ShareReply)$/i)) return false;
              if (l.match(/^(Author|All-star contributor|Top contributor|All star contributor|Moderator|Admin)$/i)) return false;
              if (l.match(/^\d+\s*(h|m|d|w|y|hr|min|ago|giờ|phút|ngày|tuần|tháng|năm)$/i)) return false;
              return true;
            });

          console.log(`  Found ${textLines.length} text lines`);

          if (textLines.length > 0) {
            // Lấy dòng dài nhất
            content = textLines.reduce((longest, line) => {
              return line.length > longest.length ? line : longest;
            }, '');

            // Làm sạch content
            if (authorName !== 'Unknown' && content.startsWith(authorName)) {
              content = content.substring(authorName.length).trim();
            }
            // Loại bỏ timestamp ở cuối nếu có
            content = content.replace(/\s+\d+\s*(h|m|d|w|giờ|phút|ngày|hr|min)\s*$/i, '');
            // Loại bỏ UI buttons ở cuối
            content = content.replace(/\s*(LikeReply|Like Reply|Like Comment Share)\s*$/i, '');
            // Loại bỏ badge noise nếu còn
            content = content.replace(/\b(Author|All-star contributor|Top contributor|Moderator|Admin)\b\s*/gi, '');
            content = content.trim();
          }

          if (!content || content.length < 2) {
            content = '[No content]';
          }

          console.log(`  Final content: "${content.substring(0, 80)}..."`);


          // Extract Images
          const imageUrls: string[] = [];
          console.log(`  Post ${i}: Found ${allImages.length} img elements`);

          for (const img of allImages) {
            const src = img.src || '';

            if (!src) {
              console.log(`    - Empty src`);
              continue;
            }

            console.log(`    - Checking: ${src.substring(0, 120)}`);

            // Lấy TẤT CẢ images từ Facebook CDN - BỎ FILTER để test
            if (src.startsWith('http') &&
                !src.includes('emoji') &&
                !src.includes('static.xx.fbcdn') &&
                !src.includes('/rsrc.php/') &&
                !src.includes('profile') &&
                !imageUrls.includes(src)) {
              imageUrls.push(src);
              console.log(`      ✓ ADDED image #${imageUrls.length}: ${src.substring(0, 100)}`);
            } else {
              console.log(`      ✗ Filtered out (emoji/static/rsrc/profile or duplicate)`);
            }
          }

          console.log(`  Total images for post ${i}: ${imageUrls.length}`);

          // Extract Statistics - ĐƠN GIẢN HÓA
          let likesCount = 0;
          let commentsCount = 0;
          let sharesCount = 0;

          // Tìm trong aria-label (Facebook hay dùng)
          const ariaElements = post.querySelectorAll('[aria-label]');
          for (const elem of ariaElements) {
            const ariaLabel = elem.getAttribute('aria-label') || '';

            // Likes - CHẶT CHẼ HƠN
            if (likesCount === 0) {
              const likeMatch = ariaLabel.match(/(\d+(?:[,\.]\d+)?)\s*(K|k)?\s+(?:reactions?|likes?|người đã thích|thích)/i);
              if (likeMatch) {
                let num = likeMatch[1].replace(/[,\.]/g, '');
                likesCount = parseInt(num) || 0;
                if (likeMatch[2] && likeMatch[2].match(/K|k/i)) likesCount *= 1000;
              }
            }

            // Comments
            if (commentsCount === 0) {
              const commentMatch = ariaLabel.match(/(\d+(?:[,\.]\d+)?)\s*(K|k)?\s+(?:comments?|bình luận)/i);
              if (commentMatch) {
                let num = commentMatch[1].replace(/[,\.]/g, '');
                commentsCount = parseInt(num) || 0;
                if (commentMatch[2] && commentMatch[2].match(/K|k/i)) commentsCount *= 1000;
              }
            }

            // Shares
            if (sharesCount === 0) {
              const shareMatch = ariaLabel.match(/(\d+(?:[,\.]\d+)?)\s*(K|k)?\s+(?:shares?|lượt chia sẻ|chia sẻ)/i);
              if (shareMatch) {
                let num = shareMatch[1].replace(/[,\.]/g, '');
                sharesCount = parseInt(num) || 0;
                if (shareMatch[2] && shareMatch[2].match(/K|k/i)) sharesCount *= 1000;
              }
            }
          }

          console.log(`  Stats: likes=${likesCount}, comments=${commentsCount}, shares=${sharesCount}`);

          const postedAt = new Date().toISOString();
          const groupNameElement = document.querySelector('h1');
          const groupName = groupNameElement?.textContent || '';

          console.log(`Post ${i}: author="${authorName}", content="${content.substring(0, 50)}", images=${imageUrls.length}, likes=${likesCount}`);

          // Lưu tất cả posts (kể cả không có content)
          if (!results.find(r => r.postId === postId)) {
            results.push({
              postId,
              groupId,
              groupName,
              authorName,
              authorProfileUrl,
              content: content.substring(0, 5000),
              postUrl: postUrl || '',
              imageUrls: imageUrls.slice(0, 10),
              likesCount,
              commentsCount,
              uniqueCommentersCount: 0, // Sẽ được tính sau khi extract comments
              comments: [],
              sharesCount,
              postedAt,
            });
          }

          if (results.length >= limit) {
            break;
          }
        } catch (err) {
          console.error('Error extracting post:', err);
        }
      }

      return results;
    }, groupId, limit);

    return posts;
  }

  /**
   * Extract full data từ trang post riêng lẻ
   */
  private async extractFullPostData(page: Page, postUrl: string): Promise<{
    content: string;
    imageUrls: string[];
    likesCount: number;
    commentsCount: number;
    uniqueCommentersCount: number;
    comments: Array<{
      author: string;
      content: string;
      timestamp: string;
    }>;
    sharesCount: number;
  }> {
    // === NETWORK INTERCEPTION: Thu thập unique commenters từ GraphQL responses ===
    const commentersFromNetwork = new Set<string>();
    const responseHandler = async (response: any) => {
      try {
        const url = response.url();
        if (!url.includes('/api/graphql')) return;
        const text = await response.text();
        if (!text.includes('"author"')) return;
        // Extract author names từ GraphQL comment responses
        // Pattern: "author":{"__typename":"User","name":"Tên người dùng",...}
        // Lưu ý: Facebook encode tiếng Việt thành \uXXXX trong JSON
        const authorRegex = /"author"\s*:\s*\{/g;
        let authorMatch;
        while ((authorMatch = authorRegex.exec(text)) !== null) {
          const startPos = authorMatch.index + authorMatch[0].length;
          const slice = text.substring(startPos, startPos + 500);
          // Dùng [^"]+ thay vì [^"\\]+ để match cả Unicode escapes (\u1ea3, etc.)
          const nameMatch = slice.match(/"name"\s*:\s*"([^"]{1,150})"/);
          if (nameMatch) {
            let name = nameMatch[1].trim();
            // Decode Unicode escapes (\u1ea3 → ả) bằng JSON.parse
            try {
              name = JSON.parse('"' + name + '"');
            } catch (_) {
              // Nếu decode lỗi, dùng tên gốc
            }
            // Lọc bỏ các giá trị không phải tên người (URL, số, quá ngắn)
            if (name && name.length > 1 && !name.includes('http') && !name.includes('/')) {
              commentersFromNetwork.add(name);
            }
          }
        }
      } catch (_) {
        // Bỏ qua lỗi (response có thể là binary, bị abort, etc.)
      }
    };

    try {
      let apiLikesCount = 0;
      let apiCommentsCount = 0;

      // Strip query params để tránh Facebook mở comment popup thay vì trang post đầy đủ
      // postUrl dạng: https://...posts/123/?comment_id=456&__cft__[0]=... → chỉ lấy phần base
      const cleanPostUrl = postUrl.split('?')[0].replace(/\/$/, '') + '/';
      this.logger.log(`Navigate to clean post URL: ${cleanPostUrl}`);

      // Bắt đầu lắng nghe responses TRƯỚC KHI navigate để không bỏ sót responses
      page.on('response', responseHandler);

      // Navigate đến post
      await page.goto(cleanPostUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Đợi content load và API calls
      await this.delay(5000);

      // === EXTRACT STATS TRƯỚC KHI LOAD COMMENTS ===
      // QUAN TRỌNG: Phải extract stats TRƯỚC khi click buttons vì Facebook sẽ thay đổi DOM!
      this.logger.debug('🎯 Extract likes/comments từ buttons TRƯỚC KHI click...');

      // Tìm toàn bộ document (trang post riêng lẻ nên an toàn - chỉ có 1 post chính)
      // Lấy MAX để tránh nhầm với comment-count của related posts
      const statsFromButtons = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('div[role="button"], span[role="button"], a[role="button"]'));
        console.log(`[STATS] Searching ${allButtons.length} buttons in WHOLE document`);

        let likes = 0;
        let comments = 0;
        const allCommentButtons: string[] = [];

        // QUAN TRỌNG: Dùng FIRST "X comments" button, không phải MAX!
        // Main post luôn ở TOP trang → button của nó xuất hiện ĐẦU TIÊN
        // Related posts ở dưới → button của chúng xuất hiện SAU → không lấy nhầm
        for (const button of allButtons) {
          const text = (button.textContent || '').trim();

          // Extract comments: "384 comments", "1 comment", "384 bình luận"
          const commentsMatch = text.match(/^(\d+)\s+(?:comments?|bình\s*luận)$/i);
          if (commentsMatch) {
            const num = parseInt(commentsMatch[1]);
            allCommentButtons.push(text);
            if (comments === 0) {
              comments = num; // Lấy FIRST (không phải MAX)
            }
          }

          // Extract likes/reactions: "27 reactions", "1 reaction"
          const likesMatch = text.match(/^(\d+)\s+reactions?$/i);
          if (likesMatch && likes === 0) {
            const num = parseInt(likesMatch[1]);
            if (num > 0 && num < 100000) {
              likes = num;
            }
          }

          // Dừng khi đã tìm được cả 2
          if (comments > 0 && likes > 0) break;
        }

        console.log(`[STATS] ALL comment buttons found: ${JSON.stringify(allCommentButtons)} → first=${comments}`);
        if (comments > 0) {
          console.log(`✓✓✓ COMMENTS FROM BUTTONS (FIRST): ${comments}`);
        }
        if (likes > 0) {
          console.log(`✓✓✓ LIKES FROM BUTTONS: ${likes}`);
        }
        return { likes, comments };
      });

      this.logger.log(`✅ Stats from buttons: Likes=${statsFromButtons.likes}, Comments=${statsFromButtons.comments}`);

      // === LOAD TẤT CẢ COMMENTS bằng cách click "View more comments" ===
      this.logger.debug('Bắt đầu load tất cả comments...');

      // BƯỚC 1: Mở comments section nếu nó đang đóng
      // Tìm trong toàn trang (trang post riêng lẻ nên an toàn)
      const openedComments = await page.evaluate(() => {
        const allDocButtons = Array.from(document.querySelectorAll('div[role="button"], span[role="button"]'));
        for (const button of allDocButtons) {
          const text = (button.textContent || '').trim();
          if (text.match(/^\d+\s+(?:comments?|bình\s*luận)$/i)) {
            (button as HTMLElement).click();
            console.log(`✓ Opened comments section: "${text}"`);
            return true;
          }
        }
        console.log(`⚠️ No comments button found in document`);
        return false;
      });

      if (openedComments) {
        this.logger.debug('✓ Đã mở comments section');
        await this.delay(2000); // Đợi comments section load
      }

      // BƯỚC 2: Load tất cả comments bằng cách click "View previous/more comments" + "View X replies"
      // Strategy: Click buttons → nếu không tìm thấy, scroll qua page để trigger lazy loading → retry
      let clickCount = 0;
      let scrollRetries = 0;
      const maxClicks = 100;
      const maxScrollRetries = 3; // Scroll tối đa 3 lần để trigger lazy loading
      // Track button texts đã click → mỗi text chỉ click 1 lần (tránh infinite loop)
      const clickedTextsSet: string[] = [];

      const findAndClickButton = async (): Promise<{ found: boolean; text: string; available: string[] }> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (page.evaluate as any)((alreadyClicked: string[]) => {
          const allButtons = Array.from(document.querySelectorAll('[role="button"]'));
          const availableTexts: string[] = [];

          const priorityButtons: HTMLElement[] = [];
          const replyButtons: HTMLElement[] = [];

          for (const button of allButtons) {
            const text = (button.textContent || '').toLowerCase().trim();

            // Thu thập button text để debug
            if (text && (text.includes('comment') || text.includes('bình luận') || text.includes('repl') ||
                         text.includes('view') || text.includes('xem') || text.includes('more') ||
                         text.includes('previous') || text.includes('trước') || text.includes('phản hồi'))) {
              availableTexts.push(text.substring(0, 100));
            }

            // Pattern "load more/previous comments" → ưu tiên cao nhất
            const isMoreComments = (
              (text.includes('previous') || text.includes('trước')) &&
              (text.includes('comment') || text.includes('bình luận'))
            ) || (
              (text.includes('view') || text.includes('see') || text.includes('xem')) &&
              (text.includes('more comment') || text.includes('thêm bình luận'))
            );

            if (isMoreComments) {
              priorityButtons.push(button as HTMLElement);
              continue;
            }

            // Pattern reply buttons → ưu tiên thấp hơn
            const isReply = (
              (text.includes('view') || text.includes('see') || text.includes('xem')) &&
              (text.includes('repl') || text.includes('phản hồi'))
            ) || text.match(/·\s*\d+\s+(?:repl(?:y|ies)|phản\s*hồi)$/i) !== null
              || text.match(/^see\s+\d+\s+more(?:\s+\w+)?$/i) !== null  // "see 2 more" / "see 2 more replies"
              || text.match(/^\d+\s+(?:previous|more)\s+repl/i) !== null; // "3 previous replies"

            if (isReply) {
              replyButtons.push(button as HTMLElement);
            }
          }

          const buttonsToTry = [...priorityButtons, ...replyButtons];

          for (const button of buttonsToTry) {
            const text = (button.textContent || '').toLowerCase().trim().substring(0, 80);
            if (alreadyClicked.includes(text)) continue; // Skip đã click rồi
            (button as HTMLElement).click();
            console.log(`✓ Clicked: "${text}"`);
            return { found: true, text, available: availableTexts };
          }

          return { found: false, text: '', available: availableTexts };
        }, clickedTextsSet);
      };

      const scrollThroughPage = async () => {
        // Scroll từ trên xuống dưới để trigger lazy loading của reply buttons
        const pageHeight = await page.evaluate(() => document.body.scrollHeight);
        const step = 600;
        for (let y = 0; y <= pageHeight + step; y += step) {
          await page.evaluate((scrollY: number) => window.scrollTo(0, scrollY), y);
          await this.delay(200);
        }
        await this.delay(2000); // Đợi lazy-loaded content xuất hiện
        await page.evaluate(() => window.scrollTo(0, 0)); // Scroll về đầu
        await this.delay(300);
      };

      try {
        while (clickCount < maxClicks) {
          // Scroll lên đầu trước (để thấy "Xem trước đó" buttons nếu có)
          await page.evaluate(() => { window.scrollTo(0, 0); });
          await this.delay(300);

          const result = await findAndClickButton();

          if (result.found) {
            scrollRetries = 0; // Reset retry count khi tìm được button
            clickCount++;
            clickedTextsSet.push(result.text);
            this.logger.debug(`✓ Clicked lần ${clickCount}: "${result.text}"`);
            await this.delay(2500); // Đợi comments load
          } else {
            // Không tìm thấy button → scroll qua page để trigger lazy loading
            if (scrollRetries < maxScrollRetries) {
              scrollRetries++;
              this.logger.debug(`Không tìm thấy button (scroll retry ${scrollRetries}/${maxScrollRetries}). Available: ${JSON.stringify(result.available.slice(0, 10))}`);
              await scrollThroughPage();
              // Thử lại sau khi scroll
            } else {
              // Đã scroll đủ lần và vẫn không có button mới → done
              this.logger.debug(`Đã load hết comments sau ${clickCount} clicks, ${scrollRetries} scroll retries`);
              break;
            }
          }
        }

        if (clickCount >= maxClicks) {
          this.logger.warn(`Đạt giới hạn ${maxClicks} lần click`);
        }
      } catch (error) {
        this.logger.warn(`Lỗi khi load comments: ${error.message}`);
      }

      // Scroll về đầu trang để OCR và extract chính xác
      await page.evaluate(() => window.scrollTo(0, 0));
      await this.delay(1000);

      // ============================================
      // === SCREENSHOT + OCR APPROACH - CHÍNH XÁC 100% ===
      // ============================================
      this.logger.debug('🔍 Bắt đầu extract likes/comments bằng OCR...');

      let ocrLikesCount = 0;
      let ocrCommentsCount = 0;

      try {
        // Tìm phần hiển thị stats (likes, comments, shares)
        // Facebook hiển thị stats trong các span/div riêng biệt
        const statsElement = await page.evaluateHandle(() => {
          console.log('[OCR] Đang tìm stats section...');

          // Strategy: Tìm element có aria-label chứa "reactions" hoặc "comments"
          // Các element này thường là clickable buttons/spans
          const allElements = Array.from(document.querySelectorAll('[aria-label]'));

          let reactionElement: Element | null = null;
          let commentElement: Element | null = null;

          for (const elem of allElements) {
            const ariaLabel = elem.getAttribute('aria-label') || '';
            const lowerLabel = ariaLabel.toLowerCase();

            // Tìm reaction element
            if (!reactionElement && /\d+\s+reactions?/.test(lowerLabel)) {
              reactionElement = elem;
              console.log(`[OCR] Found reaction element: "${ariaLabel}"`);
            }

            // Tìm comment element
            if (!commentElement && /\d+\s+comments?/.test(lowerLabel)) {
              commentElement = elem;
              console.log(`[OCR] Found comment element: "${ariaLabel}"`);
            }

            if (reactionElement && commentElement) break;
          }

          // Nếu tìm được ít nhất 1 trong 2, return parent chung
          if (reactionElement || commentElement) {
            const targetElement = reactionElement || commentElement;

            // Tìm parent chứa CẢ reaction VÀ comment
            let parent = targetElement?.parentElement;
            let depth = 0;
            while (parent && depth < 10) {
              const childText = parent.textContent?.toLowerCase() || '';

              // Parent phải chứa CẢ "reaction" VÀ "comment" text
              // Và không quá dài (< 300 chars để tránh lấy cả page)
              if (childText.includes('reaction') &&
                  childText.includes('comment') &&
                  childText.length < 300) {
                console.log(`[OCR] Found stats parent container (${childText.length} chars)`);
                return parent;
              }

              parent = parent.parentElement;
              depth++;
            }

            // Nếu không tìm được parent chung, return element đầu tiên tìm được
            console.log(`[OCR] Returning single element as fallback`);
            return targetElement;
          }

          // Fallback: Tìm span/div nhỏ có text dạng "X comments"
          console.log('[OCR] Using text-based fallback search...');
          const allSpans = Array.from(document.querySelectorAll('span, div'));
          for (const span of allSpans) {
            const text = span.textContent?.trim() || '';
            // Tìm text dạng: "578 comments", "2 reactions", etc.
            if (/^\d+\s+(comment|reaction)/i.test(text) && text.length < 50) {
              console.log(`[OCR] Found stats text: "${text}"`);
              return span.parentElement || span;
            }
          }

          console.log('[OCR] Fallback to body');
          return document.body;
        });

        const boundingBox = await statsElement.asElement()?.boundingBox();

        if (boundingBox) {
          // Expand bounding box nếu quá nhỏ (< 100px width)
          // Facebook stats section thường rộng ít nhất 200-300px
          let expandedBox = { ...boundingBox };

          if (boundingBox.width < 150) {
            this.logger.debug(`📏 Bounding box quá nhỏ (${Math.round(boundingBox.width)}x${Math.round(boundingBox.height)}), expanding...`);

            // Expand ra mỗi bên 150px để capture toàn bộ stats section
            expandedBox = {
              x: Math.max(0, boundingBox.x - 150),
              y: Math.max(0, boundingBox.y - 20),
              width: 400, // Fixed width for stats section
              height: 80, // Fixed height for stats section
            };
          }

          this.logger.debug(`📸 Taking screenshot of stats section (${Math.round(expandedBox.width)}x${Math.round(expandedBox.height)})`);

          // Chụp screenshot vùng stats
          const screenshot = await page.screenshot({
            type: 'png',
            clip: {
              x: expandedBox.x,
              y: expandedBox.y,
              width: Math.min(expandedBox.width, 800), // Giới hạn width để OCR nhanh hơn
              height: Math.min(expandedBox.height, 200), // Giới hạn height
            },
          });

          // Khởi tạo Tesseract worker với cache path ngoài project
          this.logger.debug('🤖 Khởi động OCR engine...');
          const worker = await createWorker('eng', 1, {
            cachePath: process.env.TEMP || 'C:\\Windows\\Temp', // Cache ở temp folder, không trigger file watcher
          });

          // Nhận dạng text từ screenshot
          this.logger.debug('📖 Đang đọc text từ screenshot...');
          const { data: { text } } = await worker.recognize(screenshot);
          await worker.terminate();

          this.logger.debug(`✅ OCR hoàn thành. Text extracted:\n${text.substring(0, 300)}...`);

          // Parse text để lấy likes và comments
          // Facebook hiển thị dạng: "8 reactions", "19 comments", etc.

          // Extract likes/reactions
          const likesPatterns = [
            /(\d+)\s+reactions?/i,
            /(\d+)\s+(?:người\s+)?thích/i,
            /(\d+)\s+likes?/i,
            /reactions?[:\s]+(\d+)/i,
          ];

          for (const pattern of likesPatterns) {
            const match = text.match(pattern);
            if (match) {
              const num = parseInt(match[1]);
              if (num > 0 && num < 100000) { // Reasonable range
                ocrLikesCount = num;
                this.logger.debug(`✓ OCR extracted likes: ${ocrLikesCount}`);
                break;
              }
            }
          }

          // Extract comments
          const commentsPatterns = [
            /(\d+)\s+comments?/i,
            /(\d+)\s+bình\s*luận/i,
            /comments?[:\s]+(\d+)/i,
          ];

          for (const pattern of commentsPatterns) {
            const match = text.match(pattern);
            if (match) {
              const num = parseInt(match[1]);
              if (num > 0 && num < 100000) {
                ocrCommentsCount = num;
                this.logger.debug(`✓ OCR extracted comments: ${ocrCommentsCount}`);
                break;
              }
            }
          }

          if (ocrLikesCount > 0 || ocrCommentsCount > 0) {
            this.logger.log(`🎯 OCR SUCCESS: Likes=${ocrLikesCount}, Comments=${ocrCommentsCount}`);
          } else {
            this.logger.warn('⚠️ OCR không tìm thấy likes/comments trong text');
          }
        } else {
          this.logger.warn('⚠️ Không tìm thấy bounding box của stats element');
        }
      } catch (ocrError) {
        this.logger.warn(`⚠️ OCR extraction failed: ${ocrError.message}`);
        this.logger.debug('Sẽ fallback sang HTML parsing...');
      }

      // Extract data
      const data = await page.evaluate(() => {
        // ===================================================================
        // === CRITICAL FIX: CHỈ EXTRACT TỪ MAIN POST, KHÔNG PHẢI TOÀN PAGE ===
        // ===================================================================

        console.log('🎯 Tìm MAIN POST container...');

        // Tìm main post - thường là role="article" ĐẦU TIÊN trên page
        const allArticles = Array.from(document.querySelectorAll('[role="article"]'));
        console.log(`Found ${allArticles.length} articles on page`);

        // Main post thường là article ĐẦU TIÊN có kích thước lớn
        let mainPost: Element | null = null;
        for (const article of allArticles) {
          const rect = article.getBoundingClientRect();
          // Main post thường có chiều cao > 200px
          if (rect.height > 200) {
            mainPost = article;
            console.log(`✓ Found main post: height=${Math.round(rect.height)}px`);
            break;
          }
        }

        if (!mainPost) {
          console.warn('⚠️ Could not find main post, using first article');
          mainPost = allArticles[0] || document.body;
        }

        console.log('✓ Main post identified');

        // Tìm PARENT container của main post - thường chứa CẢ post VÀ stats
        let statsContainer: Element = mainPost;
        if (mainPost.parentElement) {
          // Lấy parent của article - parent này thường chứa article + stats section
          statsContainer = mainPost.parentElement;
          console.log(`✓ Using parent container for stats extraction (height=${Math.round(statsContainer.getBoundingClientRect().height)}px)`);
        }

        // Extract images - CHỈ TỪ MAIN POST (không lấy từ stats container vì có thể chứa ads)
        const imageUrls: string[] = [];
        const allImages = mainPost.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]');

        allImages.forEach((img: HTMLImageElement) => {
          const src = img.src;
          if (src &&
              !src.includes('emoji') &&
              !src.includes('static.xx.fbcdn') &&
              !src.includes('/rsrc.php/') &&
              !src.includes('profile') &&
              img.width > 100) {  // Chỉ lấy ảnh lớn
            if (!imageUrls.includes(src)) {
              imageUrls.push(src);
            }
          }
        });

        // Extract content - CHỈ tìm trong MAIN POST
        let content = '';
        const contentSelectors = [
          '[data-ad-comet-preview="message"]',
          '[data-ad-preview="message"]',
          'div[dir="auto"]',
        ];

        for (const selector of contentSelectors) {
          const elements = mainPost.querySelectorAll(selector);
          for (const elem of elements) {
            const text = (elem as HTMLElement).textContent?.trim() || '';
            if (text.length > content.length && text.length < 10000) {
              content = text;
            }
          }
        }

        // === DEBUG: Tìm TẤT CẢ aria-labels trong STATS CONTAINER (parent của main post) để xem patterns ===
        const ariaElements = statsContainer.querySelectorAll('[aria-label]');
        console.log(`=== STATS DEBUG: Found ${ariaElements.length} elements with aria-label IN STATS CONTAINER`);

        const allAriaLabels: string[] = [];
        ariaElements.forEach(elem => {
          const label = elem.getAttribute('aria-label') || '';
          if (label && label.length < 200) {
            allAriaLabels.push(label);
          }
        });

        // Log TẤT CẢ aria-labels để debug
        console.log(`=== ALL aria-labels in stats container:`);
        allAriaLabels.forEach((label, i) => {
          console.log(`  ${i + 1}. "${label}"`);
        });

        // DEBUG: Log text content của stats container
        const statsText = (statsContainer as HTMLElement).innerText || '';
        console.log(`=== Stats container TEXT (first 500 chars):`);
        console.log(statsText.substring(0, 500));

        // Tìm aria-labels có chứa số
        const labelsWithNumbers = allAriaLabels.filter(label => /\d+/.test(label));
        console.log(`=== Aria-labels with numbers (${labelsWithNumbers.length}):`);
        labelsWithNumbers.slice(0, 15).forEach((label, i) => {
          console.log(`  ${i + 1}. "${label}"`);
        });

        // Extract stats với NHIỀU patterns
        let likesCount = 0;
        let commentsCount = 0;
        let sharesCount = 0;

        // === PRIORITY 1: Extract từ BUTTON TEXT (chính xác nhất!) ===
        // Facebook hiển thị "X comments", "X reactions" trong buttons
        const allButtons = statsContainer.querySelectorAll('div[role="button"], span[role="button"], a[role="button"]');
        console.log(`=== Found ${allButtons.length} clickable buttons in stats container`);

        const buttonTexts: string[] = [];
        allButtons.forEach(btn => {
          const text = (btn.textContent || '').trim();
          if (text && text.length < 100) {
            buttonTexts.push(text);
          }
        });

        console.log(`=== Button texts (first 20):`);
        buttonTexts.slice(0, 20).forEach((text, i) => {
          console.log(`  ${i + 1}. "${text}"`);
        });

        // Extract likes từ button text
        if (likesCount === 0) {
          for (const text of buttonTexts) {
            // Pattern: "X reactions", "X", "X người thích"
            const patterns = [
              /^(\d+)\s+reactions?$/i,
              /^(\d+)\s+(?:người\s+)?thích$/i,
              /^(\d+)$/,  // Chỉ có số
            ];

            for (const pattern of patterns) {
              const match = text.match(pattern);
              if (match) {
                const num = parseInt(match[1]);
                if (num > 0 && num < 100000) {
                  likesCount = num;
                  console.log(`  ✓✓✓ Found likes from BUTTON TEXT: ${likesCount} (button: "${text}")`);
                  break;
                }
              }
            }
            if (likesCount > 0) break;
          }
        }

        // Extract comments từ button text
        if (commentsCount === 0) {
          for (const text of buttonTexts) {
            // Pattern: "X comments", "X bình luận"
            const patterns = [
              /^(\d+)\s+comments?$/i,
              /^(\d+)\s+bình\s*luận$/i,
            ];

            for (const pattern of patterns) {
              const match = text.match(pattern);
              if (match) {
                const num = parseInt(match[1]);
                if (num > 0 && num < 100000) {
                  commentsCount = num;
                  console.log(`  ✓✓✓ Found comments from BUTTON TEXT: ${commentsCount} (button: "${text}")`);
                  break;
                }
              }
            }
            if (commentsCount > 0) break;
          }
        }

        // === FALLBACK: Extract từ aria-labels ===
        for (const label of allAriaLabels) {
          // Likes - THỬ NHIỀU PATTERNS
          if (likesCount === 0) {
            const patterns = [
              /(\d+(?:[,\.]\d+)?)\s*(?:K|k|M|m)?\s*(?:reactions?|likes?|thích|người thích|lượt thích)/i,
              /(\d+)\s+(?:người|others?)\s+(?:reacted?|like)/i,
              /(\d+)\s*(?:reactions?|likes?)/i,
              /All reactions:\s*(\d+)/i,
            ];

            for (const pattern of patterns) {
              const match = label.match(pattern);
              if (match) {
                let num = parseInt(match[1].replace(/[,\.]/g, '')) || 0;
                if (label.match(/K|k/i) && !label.match(/\d+K/)) num *= 1000;
                if (num > 0) {
                  likesCount = num;
                  console.log(`  ✓ Found likes: ${num} from "${label}"`);
                  break;
                }
              }
            }
          }

          // Comments - THỬ NHIỀU PATTERNS
          if (commentsCount === 0) {
            const patterns = [
              /(\d+(?:[,\.]\d+)?)\s*(?:K|k|M|m)?\s*(?:comments?|bình luận|comment)/i,
              /(\d+)\s+(?:comments?|bình luận)/i,
              /View\s+(\d+)\s+comments?/i,
              /(\d+)\s+(?:người|others?)\s+commented/i,
            ];

            for (const pattern of patterns) {
              const match = label.match(pattern);
              if (match) {
                let num = parseInt(match[1].replace(/[,\.]/g, '')) || 0;
                if (label.match(/K|k/i) && !label.match(/\d+K/)) num *= 1000;
                if (num > 0) {
                  commentsCount = num;
                  console.log(`  ✓ Found comments: ${num} from "${label}"`);
                  break;
                }
              }
            }
          }

          // Shares - THỬ NHIỀU PATTERNS
          if (sharesCount === 0) {
            const patterns = [
              /(\d+(?:[,\.]\d+)?)\s*(?:K|k|M|m)?\s*(?:shares?|chia sẻ|lượt chia sẻ)/i,
              /(\d+)\s+(?:shares?|chia sẻ)/i,
              /(\d+)\s+(?:người|others?)\s+shared/i,
            ];

            for (const pattern of patterns) {
              const match = label.match(pattern);
              if (match) {
                let num = parseInt(match[1].replace(/[,\.]/g, '')) || 0;
                if (label.match(/K|k/i) && !label.match(/\d+K/)) num *= 1000;
                if (num > 0) {
                  sharesCount = num;
                  console.log(`  ✓ Found shares: ${num} from "${label}"`);
                  break;
                }
              }
            }
          }
        }

        // === SIMPLE APPROACH: Extract từ TEXT CONTENT CỦA STATS CONTAINER ===
        // Parse text từ stats container (parent của main post chứa cả stats)

        // Tìm likes/reactions từ text content CỦA STATS CONTAINER
        if (likesCount === 0) {
          const containerText = (statsContainer as HTMLElement).innerText || '';

          // Tìm patterns như: "8 reactions", "27 người thích", etc.
          const reactionsMatch = containerText.match(/(\d+)\s+(?:reactions?|người\s+thích|lượt\s+thích)/i);
          if (reactionsMatch) {
            const num = parseInt(reactionsMatch[1]);
            if (num > 0 && num < 10000) { // Reasonable range
              likesCount = num;
              console.log(`  ✓ Found likes from STATS CONTAINER text: ${likesCount}`);
            }
          }
        }

        // Tìm comments count từ text content CỦA STATS CONTAINER
        if (commentsCount === 0) {
          const containerText = (statsContainer as HTMLElement).innerText || '';

          // Tìm patterns như: "19 comments", "17 bình luận", etc.
          const commentsMatch = containerText.match(/(\d+)\s+(?:comments?|bình\s*luận)/i);
          if (commentsMatch) {
            const num = parseInt(commentsMatch[1]);
            if (num > 0 && num < 10000) {
              commentsCount = num;
              console.log(`  ✓ Found comments from STATS CONTAINER text: ${commentsCount}`);
            }
          }
        }

        // === FALLBACK: Đếm elements TRONG STATS CONTAINER nếu không tìm được từ text ===
        if (commentsCount === 0) {
          // Đếm CHỈ top-level comments TRONG STATS CONTAINER, KHÔNG bao gồm replies
          const allCommentElements = statsContainer.querySelectorAll('[aria-label*="Comment by"], [aria-label*="Bình luận của"]');

          // Filter: Chỉ lấy comments KHÔNG nằm trong reply section
          const topLevelComments = Array.from(allCommentElements).filter(elem => {
            // Check nếu element nằm trong reply section (thường có data-testid hoặc role khác)
            let parent = elem.parentElement;
            let depth = 0;
            const maxDepth = 10; // Limit để tránh infinite loop

            while (parent && depth < maxDepth) {
              // Nếu parent có class/id/attribute chỉ ra đây là reply section, bỏ qua
              const parentText = parent.className + ' ' + parent.id + ' ' + (parent.getAttribute('data-testid') || '');
              if (parentText.toLowerCase().includes('reply') ||
                  parentText.toLowerCase().includes('nested')) {
                return false; // Đây là reply, không đếm
              }

              // Nếu parent là comment element khác, thì element hiện tại là reply
              const parentAriaLabel = parent.getAttribute('aria-label') || '';
              if (parentAriaLabel.toLowerCase().includes('comment by') ||
                  parentAriaLabel.toLowerCase().includes('bình luận của')) {
                return false; // Đây là reply của comment khác
              }

              parent = parent.parentElement;
              depth++;
            }

            return true; // Đây là top-level comment
          });

          commentsCount = topLevelComments.length;
          console.log(`  ✓ Counted ${commentsCount} TOP-LEVEL comments (filtered ${allCommentElements.length - topLevelComments.length} replies)`);
        }

        if (likesCount === 0) {
          // Strategy 1: Tìm trong aria-label chứa reaction count TRONG STATS CONTAINER
          // QUAN TRỌNG: CHỈ lấy reactions của POST này, KHÔNG phải của comments hoặc posts khác
          const allElements = statsContainer.querySelectorAll('[aria-label]');

          for (const elem of allElements) {
            const ariaLabel = elem.getAttribute('aria-label') || '';

            // Skip nếu element này thuộc về comment (để tránh lấy reactions của comment)
            let isCommentReaction = false;
            let parent = elem.parentElement;
            let depth = 0;
            while (parent && depth < 8) {
              const parentAriaLabel = parent.getAttribute('aria-label') || '';
              const parentClass = parent.className || '';

              // Nếu parent là comment element, skip
              if (parentAriaLabel.toLowerCase().includes('comment by') ||
                  parentAriaLabel.toLowerCase().includes('bình luận của') ||
                  parentClass.includes('comment')) {
                isCommentReaction = true;
                break;
              }
              parent = parent.parentElement;
              depth++;
            }

            if (isCommentReaction) continue; // Skip reactions của comments

            // Pattern: "X reaction; see who reacted" hoặc "All reactions: X"
            const patterns = [
              /^(\d+)\s+reactions?[;,\s]/i,                    // "8 reaction; see who reacted"
              /^All\s+reactions?:\s*(\d+)/i,                   // "All reactions: 8"
              /^See\s+who\s+reacted.*?(\d+)\s+reactions?/i,   // "See who reacted... 8 reactions"
            ];

            for (const pattern of patterns) {
              const match = ariaLabel.match(pattern);
              if (match) {
                const num = parseInt(match[1]) || 0;
                // Chỉ chấp nhận nếu số hợp lý (< 100000)
                if (num > 0 && num < 100000 && likesCount === 0) {
                  likesCount = num;
                  console.log(`  ✓ Found likes: ${likesCount} from POST (not comment) aria-label: "${ariaLabel.substring(0, 50)}..."`);
                  break;
                }
              }
            }

            if (likesCount > 0) break;
          }
        }

        console.log(`=== FINAL STATS: likes=${likesCount}, comments=${commentsCount}, shares=${sharesCount}`);

        // === EXTRACT TẤT CẢ COMMENTS ===
        const comments: Array<{ author: string; content: string; timestamp: string }> = [];

        // Tìm tất cả "Comment by" trong document, chỉ lấy những element NẰM SAU mainPost
        // (tránh lấy comments từ các post khác được hiển thị phía trên)
        let commentElements: Element[] = [];

        // === DEBUG: Xem TẤT CẢ aria-label liên quan đến comment để tìm pattern đúng ===
        const allAriaElems = Array.from(document.querySelectorAll('[aria-label]'));
        const commentRelatedLabels = allAriaElems
          .map(el => el.getAttribute('aria-label') || '')
          .filter(l => {
            const lc = l.toLowerCase();
            return lc.includes('comment') || lc.includes('bình luận') || lc.includes('reply') || lc.includes('phản hồi') || lc.includes('bởi') || lc.includes(' by ');
          });
        console.log(`=== ALL comment-related aria-labels (${commentRelatedLabels.length}): ${JSON.stringify(commentRelatedLabels.slice(0, 30))}`);

        // === TÌM COMMENTS của MAIN POST ===
        // Strategy: Lấy TẤT CẢ comment elements SAU mainPost VÀ KHÔNG nằm trong article nào khác
        // Logic:
        // - Main post comments: nằm SAU mainPost, KHÔNG nằm trong bất kỳ [role="article"] nào
        //   (comments section là SIBLING của main post article, không phải con)
        // - Related post comments: nằm SAU mainPost, nhưng nằm TRONG article của related post đó
        //   → loại trừ bằng cách check ancestor
        const allCommentElems = Array.from(document.querySelectorAll(
          '[aria-label*="Comment by"], [aria-label*="Bình luận của"], [aria-label*="Bình luận bởi"], [aria-label*="Reply by"], [aria-label*="Phản hồi của"], [aria-label*="Phản hồi bởi"]'
        ));

        commentElements = allCommentElems.filter(elem => {
          // Phải nằm SAU mainPost trong DOM
          if (!(mainPost.compareDocumentPosition(elem) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;

          // KHÔNG được nằm trong bất kỳ [role="article"] nào (kể cả mainPost hay related posts)
          // Vì comments section của main post là SIBLING, không phải CON của article
          let ancestor: Element | null = elem.parentElement;
          while (ancestor && ancestor !== document.body) {
            if (ancestor.getAttribute('role') === 'article') return false; // Nằm trong article → related post
            ancestor = ancestor.parentElement;
          }
          return true;
        });

        console.log(`Found ${commentElements.length} comment elements (after mainPost, not inside any article)`);

        // === ĐẾM UNIQUE COMMENTERS trực tiếp từ aria-label ===
        // Set tự xử lý trùng lặp: 1 người comment 3 lần vẫn chỉ đếm là 1
        const uniqueAuthors = new Set<string>();
        // Patterns:
        // "Comment by NAME 4 minutes ago"
        // "Comment by NAME about an hour ago"   ← tricky: "about an hour" không có số
        // "Reply by NAME to OTHER's comment 2 seconds ago" → chỉ lấy NAME, dừng tại " to "
        // "Bình luận của TÊN · 5 phút"
        for (const elem of commentElements) {
          const ariaLabel = elem.getAttribute('aria-label') || '';
          // Bước 1: Lấy phần sau "Comment by" đến " to " hoặc " · " hoặc hết
          const rawMatch = ariaLabel.match(
            /(?:Comment by|Reply by|Bình luận của|Bình luận bởi|Phản hồi của|Phản hồi bởi)\s+(.+?)(?:\s+to\s+\S|\s*[·•]\s*|$)/i
          );
          if (rawMatch) {
            let name = rawMatch[1].trim();
            // Bước 2: Xóa phần thời gian ở cuối (e.g. "4 minutes ago", "about an hour ago", "just now")
            name = name.replace(/\s+(?:(?:about|just|around|khoảng)\s+)?(?:an?\s+|\d+\s+)?(?:minute|hour|day|second|week|month|year|giờ|phút|giây|ngày|tuần|tháng|năm)s?\s*(?:ago)?$/i, '').trim();
            name = name.replace(/\s+(?:just now|vừa xong|vừa rồi|now)$/i, '').trim();
            if (name && name.length > 1) uniqueAuthors.add(name);
          }
        }

        const uniqueAuthorNames = Array.from(uniqueAuthors);
        console.log(`DOM unique authors (${uniqueAuthorNames.length}): ${JSON.stringify(uniqueAuthorNames.slice(0, 20))}`);
        console.log(`Extracted from post page: content.length=${content.length}, images=${imageUrls.length}, likes=${likesCount}, comments=${commentsCount}, uniqueCommenters(DOM)=${uniqueAuthorNames.length}, shares=${sharesCount}`);

        return {
          content: content || '[No content]',
          imageUrls: imageUrls.slice(0, 10),
          likesCount,
          commentsCount,
          comments,
          sharesCount,
          uniqueAuthorNames,
        };
      });

      // ============================================
      // === ƯU TIÊN: BUTTON TEXT > OCR > HTML PARSING ===
      // ============================================

      // Priority 1: Button text (chính xác nhất!)
      // Priority 2: OCR
      // Priority 3: HTML parsing

      let finalLikesCount = data.likesCount;
      let finalCommentsCount = data.commentsCount;

      // Likes: Button > OCR > HTML
      if (statsFromButtons.likes > 0) {
        finalLikesCount = statsFromButtons.likes;
        this.logger.log(`✅✅✅ Sử dụng BUTTON TEXT likes: ${finalLikesCount}`);
      } else if (ocrLikesCount > 0) {
        finalLikesCount = ocrLikesCount;
        this.logger.log(`✅ Sử dụng OCR likes: ${finalLikesCount}`);
      } else if (data.likesCount > 0) {
        this.logger.warn(`⚠️ Fallback HTML parsing likes: ${finalLikesCount}`);
      }

      // Comments: Button > OCR > HTML
      if (statsFromButtons.comments > 0) {
        finalCommentsCount = statsFromButtons.comments;
        this.logger.log(`✅✅✅ Sử dụng BUTTON TEXT comments: ${finalCommentsCount}`);
      } else if (ocrCommentsCount > 0) {
        finalCommentsCount = ocrCommentsCount;
        this.logger.log(`✅ Sử dụng OCR comments: ${finalCommentsCount}`);
      } else if (data.commentsCount > 0) {
        this.logger.warn(`⚠️ Fallback HTML parsing comments: ${finalCommentsCount}`);
      }

      // Kết hợp Network + DOM để có danh sách unique commenters chính xác nhất
      // Network: capture tên từ GraphQL responses khi load thêm comments
      // DOM: capture tên từ aria-label của comments đã render sẵn trong HTML
      const networkNames = Array.from(commentersFromNetwork);
      const domNames: string[] = (data as any).uniqueAuthorNames || [];
      const combinedAuthors = new Set([...domNames, ...networkNames]);
      const combinedUniqueCount = combinedAuthors.size;

      this.logger.log(`🌐 Network: ${networkNames.length} names | DOM: ${domNames.length} names | Combined: ${combinedUniqueCount} unique`);
      if (networkNames.length > 0) {
        this.logger.debug(`🌐 Network names: ${JSON.stringify(networkNames.slice(0, 20))}`);
      }

      // KHÔNG cap unique bởi commentsCount vì:
      // - commentsCount có thể chỉ đếm top-level comments (không tính replies)
      // - Nhưng uniqueCommenters đếm cả người reply → có thể > commentsCount một cách hợp lệ
      const finalUniqueCommentersCount = combinedUniqueCount;
      this.logger.log(`✅ Final unique commenters: ${finalUniqueCommentersCount} (DOM=${domNames.length}, network=${networkNames.length})`);

      // Đảm bảo tính nhất quán: commentsCount >= uniqueCommentersCount
      const consistentCommentsCount = Math.max(finalCommentsCount, finalUniqueCommentersCount);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { uniqueAuthorNames: _removed, ...dataWithoutNames } = data as any;
      return {
        ...dataWithoutNames,
        likesCount: finalLikesCount,
        commentsCount: consistentCommentsCount,
        uniqueCommentersCount: finalUniqueCommentersCount,
      };
    } catch (error) {
      this.logger.error(`Error extracting post data: ${error.message}`);
      return {
        content: '[No content]',
        imageUrls: [],
        likesCount: 0,
        commentsCount: 0,
        uniqueCommentersCount: 0,
        comments: [],
        sharesCount: 0,
      };
    } finally {
      try {
        page.off('response', responseHandler);
      } catch (_) {}
    }
  }

  private extractGroupId(url: string): string {
    const match = url.match(/groups\/(\d+)/);
    return match ? match[1] : '';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}