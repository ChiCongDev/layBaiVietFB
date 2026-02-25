import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FacebookPost } from '../entities/facebook-post.entity';
import { FacebookCrawlerService, CrawledPost } from './facebook-crawler.service';

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);

  constructor(
    @InjectRepository(FacebookPost)
    private readonly postRepository: Repository<FacebookPost>,
    private readonly crawlerService: FacebookCrawlerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Crawl bài viết và lưu vào database
   */
  async crawlAndSave(groupUrl?: string, limit?: number): Promise<FacebookPost[]> {
    const url = groupUrl || this.configService.get('FB_GROUP_URL');
    const crawlLimit = limit || this.configService.get<number>('CRAWL_LIMIT', 10);

    if (!url) {
      throw new Error('Chưa cấu hình FB_GROUP_URL trong .env');
    }

    this.logger.log(`Bắt đầu crawl ${crawlLimit} bài từ: ${url}`);

    try {
      // Crawl bài viết
      const crawledPosts = await this.crawlerService.crawlGroupPosts(url, crawlLimit);

      // Lưu vào database
      const savedPosts: FacebookPost[] = [];

      for (const post of crawledPosts) {
        try {
          const savedPost = await this.savePost(post);
          if (savedPost) {
            savedPosts.push(savedPost);
          }
        } catch (error) {
          this.logger.warn(`Không thể lưu bài ${post.postId}: ${error.message}`);
        }
      }

      this.logger.log(`Đã lưu ${savedPosts.length}/${crawledPosts.length} bài viết vào database`);

      return savedPosts;
    } catch (error) {
      this.logger.error('Lỗi crawl:', error.message);
      throw error;
    } finally {
      // QUAN TRỌNG: Đóng browser sau mỗi lần crawl để tránh zombie process
      try {
        await this.crawlerService.closeBrowser();
        this.logger.log('Đã đóng browser');
      } catch (error) {
        this.logger.warn('Lỗi khi đóng browser:', error.message);
      }
    }
  }

  /**
   * Lưu một bài viết vào database
   */
  async savePost(crawledPost: CrawledPost): Promise<FacebookPost | null> {
    // Kiểm tra bài đã tồn tại chưa
    const existing = await this.postRepository.findOne({
      where: { postId: crawledPost.postId },
    });

    if (existing) {
      // Update nếu đã tồn tại
      this.logger.debug(`Cập nhật bài viết: ${crawledPost.postId}`);

      existing.content = crawledPost.content || existing.content;
      existing.likesCount = crawledPost.likesCount;
      existing.commentsCount = crawledPost.commentsCount;
      existing.uniqueCommentersCount = crawledPost.uniqueCommentersCount;
      existing.comments = crawledPost.comments;
      existing.sharesCount = crawledPost.sharesCount;
      existing.imageUrls = crawledPost.imageUrls;

      return this.postRepository.save(existing);
    }

    // Tạo mới
    this.logger.debug(`Tạo mới bài viết: ${crawledPost.postId}`);

    const newPost = this.postRepository.create({
      postId: crawledPost.postId,
      groupId: crawledPost.groupId,
      groupName: crawledPost.groupName,
      authorName: crawledPost.authorName,
      authorProfileUrl: crawledPost.authorProfileUrl,
      content: crawledPost.content,
      postUrl: crawledPost.postUrl,
      imageUrls: crawledPost.imageUrls,
      likesCount: crawledPost.likesCount,
      commentsCount: crawledPost.commentsCount,
      uniqueCommentersCount: crawledPost.uniqueCommentersCount,
      comments: crawledPost.comments,
      sharesCount: crawledPost.sharesCount,
      postedAt: new Date(crawledPost.postedAt),
    });

    return this.postRepository.save(newPost);
  }

  /**
   * Lấy tất cả bài viết đã lưu
   */
  async getAllPosts(page: number = 1, limit: number = 20): Promise<{
    data: FacebookPost[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const [data, total] = await this.postRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Lấy bài viết theo ID
   */
  async getPostById(id: number): Promise<FacebookPost> {
    return this.postRepository.findOne({ where: { id } });
  }

  /**
   * Lấy bài viết theo Post ID (Facebook ID)
   */
  async getPostByPostId(postId: string): Promise<FacebookPost> {
    return this.postRepository.findOne({ where: { postId } });
  }

  /**
   * Tìm kiếm bài viết theo nội dung
   */
  async searchPosts(keyword: string, page: number = 1, limit: number = 20): Promise<{
    data: FacebookPost[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const query = this.postRepository
      .createQueryBuilder('post')
      .where('post.content LIKE :keyword', { keyword: `%${keyword}%` })
      .orWhere('post.authorName LIKE :keyword', { keyword: `%${keyword}%` })
      .orderBy('post.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Lấy thống kê
   */
  async getStatistics(): Promise<{
    totalPosts: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    postsToday: number;
  }> {
    const totalPosts = await this.postRepository.count();

    const stats = await this.postRepository
      .createQueryBuilder('post')
      .select('SUM(post.likesCount)', 'totalLikes')
      .addSelect('SUM(post.commentsCount)', 'totalComments')
      .addSelect('SUM(post.sharesCount)', 'totalShares')
      .getRawOne();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const postsToday = await this.postRepository
      .createQueryBuilder('post')
      .where('post.createdAt >= :today', { today })
      .getCount();

    return {
      totalPosts,
      totalLikes: parseInt(stats.totalLikes) || 0,
      totalComments: parseInt(stats.totalComments) || 0,
      totalShares: parseInt(stats.totalShares) || 0,
      postsToday,
    };
  }

  /**
   * Xóa bài viết
   */
  async deletePost(id: number): Promise<boolean> {
    const result = await this.postRepository.delete(id);
    return result.affected > 0;
  }

  /**
   * Auto crawl mỗi 30 phút (có thể bật/tắt)
   */
  // @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledCrawl(): Promise<void> {
    this.logger.log('Bắt đầu scheduled crawl...');
    try {
      await this.crawlAndSave();
    } catch (error) {
      this.logger.error('Scheduled crawl thất bại:', error.message);
    }
  }

  /**
   * Kiểm tra một post cụ thể - đếm số người bình luận
   */
  async checkSinglePost(postUrl: string): Promise<{
    postUrl: string;
    totalComments: number;
    uniqueCommenters: number;
    commenters: Array<{ name: string; commentCount: number }>;
  }> {
    this.logger.log(`Đang kiểm tra post: ${postUrl}`);

    try {
      // Tạo một "fake" crawled post chỉ có URL
      const tempPost: CrawledPost = {
        postId: 'temp',
        groupId: 'temp',
        groupName: '',
        authorName: '',
        authorProfileUrl: '',
        content: '',
        postUrl: postUrl,
        imageUrls: [],
        likesCount: 0,
        commentsCount: 0,
        uniqueCommentersCount: 0,
        comments: [],
        sharesCount: 0,
        postedAt: new Date(),
      };

      // Visit post và lấy full data
      const enrichedPost = await this.crawlerService.visitPostAndEnrich(tempPost);

      if (!enrichedPost) {
        throw new Error('Không thể truy cập post');
      }

      // Đếm số lần mỗi người comment
      const commenterCounts = new Map<string, number>();

      for (const comment of enrichedPost.comments || []) {
        const author = comment.author;
        if (author && author !== 'Unknown') {
          commenterCounts.set(author, (commenterCounts.get(author) || 0) + 1);
        }
      }

      // Chuyển thành array và sort theo số lượng comment
      const commenters = Array.from(commenterCounts.entries())
        .map(([name, commentCount]) => ({ name, commentCount }))
        .sort((a, b) => b.commentCount - a.commentCount);

      return {
        postUrl: postUrl,
        totalComments: enrichedPost.commentsCount,
        uniqueCommenters: enrichedPost.uniqueCommentersCount,
        commenters: commenters,
      };
    } catch (error) {
      this.logger.error('Lỗi khi check post:', error.message);
      throw error;
    } finally {
      // Đóng browser
      try {
        await this.crawlerService.closeBrowser();
        this.logger.log('Đã đóng browser');
      } catch (error) {
        this.logger.warn('Lỗi khi đóng browser:', error.message);
      }
    }
  }
}
