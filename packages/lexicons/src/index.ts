import { Lexicons } from '@atproto/lexicon';

// Video schemas
import postSchema from '../schemas/io/exprsn/video/post.json' with { type: 'json' };
import likeSchema from '../schemas/io/exprsn/video/like.json' with { type: 'json' };
import commentSchema from '../schemas/io/exprsn/video/comment.json' with { type: 'json' };
import followSchema from '../schemas/io/exprsn/video/follow.json' with { type: 'json' };
import soundSchema from '../schemas/io/exprsn/video/sound.json' with { type: 'json' };
import duetSchema from '../schemas/io/exprsn/video/duet.json' with { type: 'json' };
import repostSchema from '../schemas/io/exprsn/video/repost.json' with { type: 'json' };
import reportSchema from '../schemas/io/exprsn/video/report.json' with { type: 'json' };
import bookmarkSchema from '../schemas/io/exprsn/video/bookmark.json' with { type: 'json' };
import getFeedSchema from '../schemas/io/exprsn/video/getFeed.json' with { type: 'json' };
import getVideoSchema from '../schemas/io/exprsn/video/getVideo.json' with { type: 'json' };
import getCommentsSchema from '../schemas/io/exprsn/video/getComments.json' with { type: 'json' };
import getSoundsSchema from '../schemas/io/exprsn/video/getSounds.json' with { type: 'json' };
import getBookmarksSchema from '../schemas/io/exprsn/video/getBookmarks.json' with { type: 'json' };
import searchSchema from '../schemas/io/exprsn/video/search.json' with { type: 'json' };
import uploadVideoSchema from '../schemas/io/exprsn/video/uploadVideo.json' with { type: 'json' };
import completeUploadSchema from '../schemas/io/exprsn/video/completeUpload.json' with { type: 'json' };
import getUploadStatusSchema from '../schemas/io/exprsn/video/getUploadStatus.json' with { type: 'json' };

// Graph schemas
import blockSchema from '../schemas/io/exprsn/graph/block.json' with { type: 'json' };
import muteSchema from '../schemas/io/exprsn/graph/mute.json' with { type: 'json' };
import getBlocksSchema from '../schemas/io/exprsn/graph/getBlocks.json' with { type: 'json' };
import getMutesSchema from '../schemas/io/exprsn/graph/getMutes.json' with { type: 'json' };

// Notification schemas
import notificationSubscriptionSchema from '../schemas/io/exprsn/notification/subscription.json' with { type: 'json' };

// Chat schemas
import conversationSchema from '../schemas/io/exprsn/chat/conversation.json' with { type: 'json' };
import messageSchema from '../schemas/io/exprsn/chat/message.json' with { type: 'json' };
import getConversationsSchema from '../schemas/io/exprsn/chat/getConversations.json' with { type: 'json' };
import getMessagesSchema from '../schemas/io/exprsn/chat/getMessages.json' with { type: 'json' };

export const schemas = [
  // Video
  postSchema,
  likeSchema,
  commentSchema,
  followSchema,
  soundSchema,
  duetSchema,
  repostSchema,
  reportSchema,
  bookmarkSchema,
  getFeedSchema,
  getVideoSchema,
  getCommentsSchema,
  getSoundsSchema,
  getBookmarksSchema,
  searchSchema,
  uploadVideoSchema,
  completeUploadSchema,
  getUploadStatusSchema,
  // Graph
  blockSchema,
  muteSchema,
  getBlocksSchema,
  getMutesSchema,
  // Notification
  notificationSubscriptionSchema,
  // Chat
  conversationSchema,
  messageSchema,
  getConversationsSchema,
  getMessagesSchema,
] as const;

export const lexicons = new Lexicons(schemas as unknown as Parameters<Lexicons['add']>[0][]);

export const NSID = {
  // Video records
  VideoPost: 'io.exprsn.video.post',
  VideoLike: 'io.exprsn.video.like',
  VideoComment: 'io.exprsn.video.comment',
  VideoFollow: 'io.exprsn.video.follow',
  VideoSound: 'io.exprsn.video.sound',
  VideoDuet: 'io.exprsn.video.duet',
  VideoRepost: 'io.exprsn.video.repost',
  VideoReport: 'io.exprsn.video.report',
  VideoBookmark: 'io.exprsn.video.bookmark',
  // Video queries
  GetFeed: 'io.exprsn.video.getFeed',
  GetVideo: 'io.exprsn.video.getVideo',
  GetComments: 'io.exprsn.video.getComments',
  GetSounds: 'io.exprsn.video.getSounds',
  GetBookmarks: 'io.exprsn.video.getBookmarks',
  Search: 'io.exprsn.video.search',
  UploadVideo: 'io.exprsn.video.uploadVideo',
  CompleteUpload: 'io.exprsn.video.completeUpload',
  GetUploadStatus: 'io.exprsn.video.getUploadStatus',
  // Graph records
  GraphBlock: 'io.exprsn.graph.block',
  GraphMute: 'io.exprsn.graph.mute',
  // Graph queries
  GetBlocks: 'io.exprsn.graph.getBlocks',
  GetMutes: 'io.exprsn.graph.getMutes',
  // Notification records
  NotificationSubscription: 'io.exprsn.notification.subscription',
  // Chat records
  ChatConversation: 'io.exprsn.chat.conversation',
  ChatMessage: 'io.exprsn.chat.message',
  // Chat queries
  GetConversations: 'io.exprsn.chat.getConversations',
  GetMessages: 'io.exprsn.chat.getMessages',
} as const;

export type VideoPost = {
  $type: 'io.exprsn.video.post';
  video: VideoEmbed;
  caption?: string;
  tags?: string[];
  sound?: SoundRef;
  mentions?: Mention[];
  visibility?: 'public' | 'followers';
  allowDuet?: boolean;
  allowStitch?: boolean;
  allowComments?: boolean;
  createdAt: string;
};

export type VideoEmbed = {
  blob?: BlobRef;
  thumbnail?: BlobRef;
  aspectRatio: AspectRatio;
  duration: number;
  cdnUrl?: string;
  hlsPlaylist?: string;
};

export type AspectRatio = {
  width: number;
  height: number;
};

export type BlobRef = {
  $type: 'blob';
  ref: { $link: string };
  mimeType: string;
  size: number;
};

export type SoundRef = {
  originalPostUri?: string;
  soundId?: string;
  title?: string;
  artist?: string;
};

export type Mention = {
  did: string;
};

export type VideoLike = {
  $type: 'io.exprsn.video.like';
  subject: StrongRef;
  createdAt: string;
};

export type VideoComment = {
  $type: 'io.exprsn.video.comment';
  root: StrongRef;
  parent?: StrongRef;
  text: string;
  mentions?: CommentMention[];
  createdAt: string;
};

export type CommentMention = {
  did: string;
  index: ByteSlice;
};

export type ByteSlice = {
  byteStart: number;
  byteEnd: number;
};

export type VideoFollow = {
  $type: 'io.exprsn.video.follow';
  subject: string;
  createdAt: string;
};

export type VideoRepost = {
  $type: 'io.exprsn.video.repost';
  subject: StrongRef;
  caption?: string;
  createdAt: string;
};

export type VideoReport = {
  $type: 'io.exprsn.video.report';
  subject: StrongRef;
  reason: 'spam' | 'harassment' | 'hate_speech' | 'violence' | 'nudity' | 'misinformation' | 'copyright' | 'self_harm' | 'other';
  description?: string;
  createdAt: string;
};

export type VideoBookmark = {
  $type: 'io.exprsn.video.bookmark';
  subject: StrongRef;
  folder?: string;
  createdAt: string;
};

export type GraphBlock = {
  $type: 'io.exprsn.graph.block';
  subject: string;
  createdAt: string;
};

export type GraphMute = {
  $type: 'io.exprsn.graph.mute';
  subject: string;
  createdAt: string;
};

export type NotificationSubscription = {
  $type: 'io.exprsn.notification.subscription';
  likes?: boolean;
  comments?: boolean;
  follows?: boolean;
  mentions?: boolean;
  reposts?: boolean;
  messages?: boolean;
  fromFollowingOnly?: boolean;
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  createdAt: string;
};

export type ChatConversation = {
  $type: 'io.exprsn.chat.conversation';
  members: string[];
  createdAt: string;
};

export type ChatMessage = {
  $type: 'io.exprsn.chat.message';
  conversationId: string;
  text: string;
  replyTo?: string;
  embed?: VideoEmbed | ImageEmbed;
  createdAt: string;
};

export type ImageEmbed = {
  image: BlobRef;
  alt?: string;
};

export type StrongRef = {
  uri: string;
  cid: string;
};

// Export schemas
export { postSchema, likeSchema, commentSchema, followSchema, soundSchema, duetSchema, repostSchema, reportSchema, bookmarkSchema };
export { blockSchema, muteSchema, getBlocksSchema, getMutesSchema };
export { notificationSubscriptionSchema };
export { conversationSchema, messageSchema, getConversationsSchema, getMessagesSchema };
export {
  getFeedSchema,
  getVideoSchema,
  getCommentsSchema,
  getSoundsSchema,
  getBookmarksSchema,
  searchSchema,
  uploadVideoSchema,
  completeUploadSchema,
  getUploadStatusSchema,
};
