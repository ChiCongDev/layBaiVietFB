import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('facebook_posts')
export class FacebookPost {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'post_id', unique: true })
  postId: string;

  @Column({ name: 'group_id' })
  groupId: string;

  @Column({ name: 'group_name', nullable: true })
  groupName: string;

  @Column({ name: 'author_name', nullable: true })
  authorName: string;

  @Column({ name: 'author_profile_url', type: 'text', nullable: true })
  authorProfileUrl: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ name: 'post_url', type: 'text', nullable: true })
  postUrl: string;

  @Column({ name: 'image_urls', type: 'json', nullable: true })
  imageUrls: string[];

  @Column({ name: 'likes_count', default: 0 })
  likesCount: number;

  @Column({ name: 'comments_count', default: 0 })
  commentsCount: number;

  @Column({ name: 'unique_commenters_count', default: 0 })
  uniqueCommentersCount: number;

  @Column({ name: 'comments', type: 'json', nullable: true })
  comments: Array<{
    author: string;
    content: string;
    timestamp: string;
  }>;

  @Column({ name: 'shares_count', default: 0 })
  sharesCount: number;

  @Column({ name: 'posted_at', nullable: true })
  postedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}