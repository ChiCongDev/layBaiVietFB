import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer, { Browser, Page } from 'puppeteer-core';

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

      await page.goto('https://www.facebook.com/login', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      await this.delay(2000);

      await page.waitForSelector('#email', { timeout: 10000 });
      await page.type('#email', email, { delay: 50 });
      await page.type('#pass', password, { delay: 50 });
      await page.click('[name="login"]');

      await this.delay(5000);

      const currentUrl = page.url();
      if (currentUrl.includes('login') || currentUrl.includes('checkpoint')) {
        this.logger.error('Đăng nhập thất bại hoặc cần xác minh');
        return false;
      }

      this.logger.log('Đăng nhập thành công!');
      return true;
    } catch (error) {
      this.logger.error('Lỗi đăng nhập:', error.message);
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
      const cookies = JSON.parse(cookiesString);
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

    for (let i = 0; i < scrollCount; i++) {
      try {
        await page.evaluate(() => {
          const closeButtons = document.querySelectorAll('[aria-label="Close"], [aria-label="Đóng"], [role="button"][aria-label*="close"]');
          closeButtons.forEach(btn => (btn as HTMLElement).click());
          
          const overlays = document.querySelectorAll('[role="dialog"], [data-testid="dialog_root"]');
          overlays.forEach(el => (el as HTMLElement).style.display = 'none');
        });
      } catch (e) {}

      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 2);
      });

      await this.delay(2000 + Math.random() * 1000);
      this.logger.debug(`Scroll ${i + 1}/${scrollCount}`);
    }
  }

  async crawlGroupPosts(groupUrl: string, limit: number = 10): Promise<CrawledPost[]> {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

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
      await this.handleLoginPopup(page);
      await this.delay(3000);

      try {
        const closeButtons = await page.$$('[aria-label="Close"], [aria-label="Đóng"], div[aria-label="Close"]');
        for (const btn of closeButtons) {
          await btn.click();
          await this.delay(500);
        }
      } catch (e) {}

      // Click vào tab Discussion/Thảo luận để xem bài viết
      try {
        this.logger.log('Đang tìm tab Discussion/Thảo luận...');
        const discussionTabSelectors = [
          'a[href*="/discussion"]',
          'span:has-text("Discussion")',
          'span:has-text("Thảo luận")',
          'a[role="tab"]:has-text("Discussion")',
          'a[role="tab"]:has-text("Thảo luận")',
        ];
        
        for (const selector of discussionTabSelectors) {
          try {
            const tab = await page.$(selector);
            if (tab) {
              await tab.click();
              this.logger.log('Đã click vào tab Discussion');
              await this.delay(3000);
              break;
            }
          } catch (e) {
            // Try next selector
          }
        }

        // Thử click bằng evaluate nếu selector không hoạt động
        await page.evaluate(() => {
          const tabs = document.querySelectorAll('a[role="tab"], span[role="tab"]');
          for (const tab of tabs) {
            const text = tab.textContent?.toLowerCase() || '';
            if (text.includes('discussion') || text.includes('thảo luận')) {
              (tab as HTMLElement).click();
              break;
            }
          }
        });
        
        await this.delay(3000);
      } catch (e) {
        this.logger.warn('Không tìm thấy tab Discussion, tiếp tục...');
      }

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



      const scrollCount = Math.max(limit, 10);
      await this.autoScroll(page, scrollCount);

      const posts = await this.extractPosts(page, groupUrl, limit);
      this.logger.log(`Đã crawl được ${posts.length} bài viết`);

      return posts;
    } catch (error) {
      this.logger.error('Lỗi crawl:', error.message);
      throw error;
    } finally {
      await page.close();
    }
  }

  private async extractPosts(page: Page, groupUrl: string, limit: number): Promise<CrawledPost[]> {
    const groupId = this.extractGroupId(groupUrl);

    const posts = await page.evaluate((groupId: string, limit: number) => {
      const results: any[] = [];
      
      const postSelectors = [
        '[role="article"]',
        'div[data-pagelet*="FeedUnit"]',
        'div[data-pagelet*="GroupFeed"] > div > div',
      ];
      
      let postElements: Element[] = [];
      
      for (const selector of postSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > postElements.length) {
          postElements = Array.from(elements);
        }
      }

      for (let i = 0; i < Math.min(postElements.length, limit * 2); i++) {
        const post = postElements[i];
        
        try {
          let postId = '';
          let postUrl = '';
          
          const allLinks = post.querySelectorAll('a[href*="/groups/"][href*="/posts/"], a[href*="/groups/"][href*="permalink"], a[href*="story_fbid"]');
          for (const link of allLinks) {
            const href = (link as HTMLAnchorElement).href;
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

          let authorName = 'Unknown';
          let authorProfileUrl = '';
          const authorSelectors = [
            'a[role="link"] strong',
            'h2 a strong',
            'h3 a strong', 
            'h4 a strong',
            'a[role="link"][tabindex="0"] > strong',
            'span > a[role="link"] > strong',
          ];
          
          for (const selector of authorSelectors) {
            const el = post.querySelector(selector);
            if (el?.textContent && el.textContent.length > 1) {
              authorName = el.textContent;
              const parentLink = el.closest('a');
              if (parentLink) {
                authorProfileUrl = (parentLink as HTMLAnchorElement).href;
              }
              break;
            }
          }

          let content = '';
          const contentSelectors = [
            '[data-ad-comet-preview="message"]',
            '[data-ad-preview="message"]',
            'div[dir="auto"][style*="text-align"]',
            'div[dir="auto"]',
            'span[dir="auto"]',
          ];
          
          for (const selector of contentSelectors) {
            const elements = post.querySelectorAll(selector);
            for (const el of elements) {
              const text = el.textContent || '';
              if (text.length > content.length && text.length > 20 && !text.includes('Like') && !text.includes('Comment') && !text.includes('Share')) {
                content = text;
              }
            }
          }

          const imageElements = post.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]');
          const imageUrls: string[] = [];
          imageElements.forEach((img: HTMLImageElement) => {
            if (img.src && !img.src.includes('emoji') && !img.src.includes('profile') && img.naturalWidth > 100) {
              imageUrls.push(img.src);
            }
          });

          const allText = post.textContent || '';
          
          let likesCount = 0;
          const likeMatch = allText.match(/(\d+(?:,\d+)?(?:\.\d+)?)\s*(?:K|k|M|m)?\s*(?:reactions?|likes?|thích)/i);
          if (likeMatch) {
            likesCount = parseFloat(likeMatch[1].replace(',', ''));
          }

          let commentsCount = 0;
          const commentMatch = allText.match(/(\d+(?:,\d+)?)\s*(?:comments?|bình luận)/i);
          if (commentMatch) {
            commentsCount = parseInt(commentMatch[1].replace(',', ''));
          }

          let sharesCount = 0;
          const shareMatch = allText.match(/(\d+(?:,\d+)?)\s*(?:shares?|chia sẻ)/i);
          if (shareMatch) {
            sharesCount = parseInt(shareMatch[1].replace(',', ''));
          }

          const postedAt = new Date().toISOString();
          const groupNameElement = document.querySelector('h1');
          const groupName = groupNameElement?.textContent || '';

          if ((content && content.length > 10) || imageUrls.length > 0) {
            if (!results.find(r => r.postId === postId)) {
              results.push({
                postId,
                groupId,
                groupName,
                authorName,
                authorProfileUrl,
                content: content.substring(0, 5000),
                postUrl,
                imageUrls: imageUrls.slice(0, 10),
                likesCount,
                commentsCount,
                sharesCount,
                postedAt,
              });
            }
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