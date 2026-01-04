import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { FacebookModule } from './facebook/facebook.module';
import { FacebookPost } from './entities/facebook-post.entity';

@Module({
  imports: [
    // Load biến môi trường từ .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Cấu hình MySQL
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get('DB_USERNAME', 'root'),
        password: configService.get('DB_PASSWORD', ''),
        database: configService.get('DB_DATABASE', 'facebook_crawler'),
        entities: [FacebookPost],
        synchronize: true, // Tự động tạo table (chỉ dùng trong dev)
        logging: false,
      }),
    }),

    // Schedule cho auto crawl
    ScheduleModule.forRoot(),

    // Facebook Module
    FacebookModule,
  ],
})
export class AppModule {}
