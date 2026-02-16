export interface VideoView {
  uri: string;
  cid: string;
  author: AuthorView;
  video: VideoEmbed;
  caption?: string;
  tags?: string[];
  sound?: SoundRef;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  viewerLike?: string;
  createdAt: string;
  indexedAt: string;
}

export interface AuthorView {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  verified?: boolean;
}

export interface VideoEmbed {
  blob?: BlobRef;
  thumbnail?: string;
  aspectRatio: AspectRatio;
  duration: number;
  cdnUrl?: string;
  hlsPlaylist?: string;
}

export interface AspectRatio {
  width: number;
  height: number;
}

export interface BlobRef {
  $type: 'blob';
  ref: { $link: string };
  mimeType: string;
  size: number;
}

export interface SoundRef {
  id: string;
  title: string;
  artist?: string;
  originalPostUri?: string;
}

export interface CommentView {
  uri: string;
  cid: string;
  author: AuthorView;
  text: string;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  replies?: CommentView[];
}

export interface FeedResult {
  feed: FeedItem[];
  cursor?: string;
}

export interface FeedItem {
  post: string;
  reason?: FeedReason;
}

export type FeedReason =
  | { type: 'trending' }
  | { type: 'following' }
  | { type: 'sound'; soundId: string }
  | { type: 'hashtag'; tag: string };

export interface UploadUrlResponse {
  uploadId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface CreatePostInput {
  uploadId: string;
  blob: BlobRef;
  thumbnail?: BlobRef;
  aspectRatio: AspectRatio;
  duration: number;
  caption?: string;
  tags?: string[];
  sound?: SoundRef;
  visibility?: 'public' | 'followers';
}

export interface UserInteraction {
  id: string;
  userDid: string;
  videoUri: string;
  type: 'view' | 'like' | 'comment' | 'share';
  watchDuration?: number;
  completionRate?: number;
  createdAt: Date;
}

// Settings and theme types
export * from './settings.js';
export * from './theme.js';
export * from './hoster.js';
