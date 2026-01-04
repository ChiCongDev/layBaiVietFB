import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
  }));

  app.enableCors();
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`🚀 Facebook Crawler đang chạy tại: http://localhost:${port}`);
  console.log(`📖 API Endpoints:`);
  console.log(`   GET  /facebook/crawl?limit=10  - Crawl bài viết mới`);
  console.log(`   GET  /facebook/posts           - Lấy tất cả bài viết đã lưu`);
  console.log(`   GET  /facebook/posts/:id       - Lấy chi tiết bài viết`);
}

bootstrap();
