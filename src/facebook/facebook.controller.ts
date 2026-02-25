import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FacebookService } from './facebook.service';

@Controller('facebook')
export class FacebookController {
  constructor(private readonly facebookService: FacebookService) {}

  /**
   * Crawl bài viết từ group
   * GET /facebook/crawl?groupUrl=xxx&limit=10
   */
  @Get('crawl')
  async crawlPosts(
    @Query('groupUrl') groupUrl?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const posts = await this.facebookService.crawlAndSave(
        groupUrl,
        limit ? parseInt(limit) : undefined,
      );

      return {
        success: true,
        message: `Đã crawl và lưu ${posts.length} bài viết`,
        data: posts,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Lấy tất cả bài viết đã lưu
   * GET /facebook/posts?page=1&limit=20
   */
  @Get('posts')
  async getAllPosts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.facebookService.getAllPosts(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Tìm kiếm bài viết
   * GET /facebook/posts/search?keyword=xxx&page=1&limit=20
   */
  @Get('posts/search')
  async searchPosts(
    @Query('keyword') keyword: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!keyword) {
      throw new HttpException(
        {
          success: false,
          message: 'Thiếu keyword tìm kiếm',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.facebookService.searchPosts(
      keyword,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );

    return {
      success: true,
      keyword,
      ...result,
    };
  }

  /**
   * Lấy thống kê
   * GET /facebook/statistics
   */
  @Get('statistics')
  async getStatistics() {
    const stats = await this.facebookService.getStatistics();

    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Lấy chi tiết bài viết theo ID
   * GET /facebook/posts/:id
   */
  @Get('posts/:id')
  async getPostById(@Param('id') id: string) {
    const post = await this.facebookService.getPostById(parseInt(id));

    if (!post) {
      throw new HttpException(
        {
          success: false,
          message: 'Không tìm thấy bài viết',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      success: true,
      data: post,
    };
  }

  /**
   * Xóa bài viết
   * DELETE /facebook/posts/:id
   */
  @Delete('posts/:id')
  async deletePost(@Param('id') id: string) {
    const deleted = await this.facebookService.deletePost(parseInt(id));

    if (!deleted) {
      throw new HttpException(
        {
          success: false,
          message: 'Không tìm thấy bài viết để xóa',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      success: true,
      message: 'Đã xóa bài viết',
    };
  }

  /**
   * Kiểm tra số người bình luận trên một post cụ thể
   * GET /facebook/check-post?url=https://www.facebook.com/groups/.../posts/...
   */
  @Get('check-post')
  async checkSinglePost(@Query('url') postUrl: string) {
    if (!postUrl) {
      throw new HttpException(
        {
          success: false,
          message: 'Thiếu parameter "url"',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.facebookService.checkSinglePost(postUrl);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
