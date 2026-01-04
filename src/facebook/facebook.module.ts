import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacebookService } from './facebook.service';
import { FacebookController } from './facebook.controller';
import { FacebookCrawlerService } from './facebook-crawler.service';
import { FacebookPost } from '../entities/facebook-post.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FacebookPost])],
  controllers: [FacebookController],
  providers: [FacebookService, FacebookCrawlerService],
  exports: [FacebookService],
})
export class FacebookModule {}
