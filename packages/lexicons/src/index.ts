import { Lexicons } from '@atproto/lexicon';

// Video schemas
import postSchema from '../schemas/io/exprsn/video/post.json' with { type: 'json' };
import likeSchema from '../schemas/io/exprsn/video/like.json' with { type: 'json' };
import commentSchema from '../schemas/io/exprsn/video/comment.json' with { type: 'json' };
import videoFollowSchema from '../schemas/io/exprsn/video/follow.json' with { type: 'json' };
import soundSchema from '../schemas/io/exprsn/video/sound.json' with { type: 'json' };
import duetSchema from '../schemas/io/exprsn/video/duet.json' with { type: 'json' };
import stitchSchema from '../schemas/io/exprsn/video/stitch.json' with { type: 'json' };
import repostSchema from '../schemas/io/exprsn/video/repost.json' with { type: 'json' };
import reportSchema from '../schemas/io/exprsn/video/report.json' with { type: 'json' };
import bookmarkSchema from '../schemas/io/exprsn/video/bookmark.json' with { type: 'json' };
import shareSchema from '../schemas/io/exprsn/video/share.json' with { type: 'json' };
import getFeedSchema from '../schemas/io/exprsn/video/getFeed.json' with { type: 'json' };
import getVideoSchema from '../schemas/io/exprsn/video/getVideo.json' with { type: 'json' };
import getCommentsSchema from '../schemas/io/exprsn/video/getComments.json' with { type: 'json' };
import getSoundsSchema from '../schemas/io/exprsn/video/getSounds.json' with { type: 'json' };
import getBookmarksSchema from '../schemas/io/exprsn/video/getBookmarks.json' with { type: 'json' };
import searchSchema from '../schemas/io/exprsn/video/search.json' with { type: 'json' };
import uploadVideoSchema from '../schemas/io/exprsn/video/uploadVideo.json' with { type: 'json' };
import completeUploadSchema from '../schemas/io/exprsn/video/completeUpload.json' with { type: 'json' };
import getUploadStatusSchema from '../schemas/io/exprsn/video/getUploadStatus.json' with { type: 'json' };
import getRepostsSchema from '../schemas/io/exprsn/video/getReposts.json' with { type: 'json' };
import getLikesSchema from '../schemas/io/exprsn/video/getLikes.json' with { type: 'json' };
import deleteVideoSchema from '../schemas/io/exprsn/video/deleteVideo.json' with { type: 'json' };
import updateVideoSchema from '../schemas/io/exprsn/video/updateVideo.json' with { type: 'json' };
import deleteCommentSchema from '../schemas/io/exprsn/video/deleteComment.json' with { type: 'json' };
import getDuetsSchema from '../schemas/io/exprsn/video/getDuets.json' with { type: 'json' };
import getStitchesSchema from '../schemas/io/exprsn/video/getStitches.json' with { type: 'json' };
import getVideosBySoundSchema from '../schemas/io/exprsn/video/getVideosBySound.json' with { type: 'json' };
import getVideosByTagSchema from '../schemas/io/exprsn/video/getVideosByTag.json' with { type: 'json' };

// Actor schemas
import getProfileSchema from '../schemas/io/exprsn/actor/getProfile.json' with { type: 'json' };
import updateProfileSchema from '../schemas/io/exprsn/actor/updateProfile.json' with { type: 'json' };
import getSuggestionsSchema from '../schemas/io/exprsn/actor/getSuggestions.json' with { type: 'json' };
import searchActorsSchema from '../schemas/io/exprsn/actor/searchActors.json' with { type: 'json' };
import getPreferencesSchema from '../schemas/io/exprsn/actor/getPreferences.json' with { type: 'json' };
import putPreferencesSchema from '../schemas/io/exprsn/actor/putPreferences.json' with { type: 'json' };

// Graph schemas
import blockSchema from '../schemas/io/exprsn/graph/block.json' with { type: 'json' };
import muteSchema from '../schemas/io/exprsn/graph/mute.json' with { type: 'json' };
import graphFollowSchema from '../schemas/io/exprsn/graph/follow.json' with { type: 'json' };
import listSchema from '../schemas/io/exprsn/graph/list.json' with { type: 'json' };
import listItemSchema from '../schemas/io/exprsn/graph/listItem.json' with { type: 'json' };
import getBlocksSchema from '../schemas/io/exprsn/graph/getBlocks.json' with { type: 'json' };
import getMutesSchema from '../schemas/io/exprsn/graph/getMutes.json' with { type: 'json' };
import getFollowersSchema from '../schemas/io/exprsn/graph/getFollowers.json' with { type: 'json' };
import getFollowingSchema from '../schemas/io/exprsn/graph/getFollowing.json' with { type: 'json' };
import getListsSchema from '../schemas/io/exprsn/graph/getLists.json' with { type: 'json' };
import getListSchema from '../schemas/io/exprsn/graph/getList.json' with { type: 'json' };

// Notification schemas
import notificationSubscriptionSchema from '../schemas/io/exprsn/notification/subscription.json' with { type: 'json' };
import listNotificationsSchema from '../schemas/io/exprsn/notification/listNotifications.json' with { type: 'json' };
import updateSeenSchema from '../schemas/io/exprsn/notification/updateSeen.json' with { type: 'json' };
import getUnreadCountSchema from '../schemas/io/exprsn/notification/getUnreadCount.json' with { type: 'json' };

// Feed schemas
import getTimelineSchema from '../schemas/io/exprsn/feed/getTimeline.json' with { type: 'json' };
import getActorLikesSchema from '../schemas/io/exprsn/feed/getActorLikes.json' with { type: 'json' };
import getSuggestedFeedSchema from '../schemas/io/exprsn/feed/getSuggestedFeed.json' with { type: 'json' };
import getActorFeedSchema from '../schemas/io/exprsn/feed/getActorFeed.json' with { type: 'json' };

// Chat schemas
import conversationSchema from '../schemas/io/exprsn/chat/conversation.json' with { type: 'json' };
import messageSchema from '../schemas/io/exprsn/chat/message.json' with { type: 'json' };
import getConversationsSchema from '../schemas/io/exprsn/chat/getConversations.json' with { type: 'json' };
import getMessagesSchema from '../schemas/io/exprsn/chat/getMessages.json' with { type: 'json' };
import deleteMessageSchema from '../schemas/io/exprsn/chat/deleteMessage.json' with { type: 'json' };
import deleteConversationSchema from '../schemas/io/exprsn/chat/deleteConversation.json' with { type: 'json' };

export const schemas = [
  // Video records
  postSchema,
  likeSchema,
  commentSchema,
  videoFollowSchema,
  soundSchema,
  duetSchema,
  stitchSchema,
  repostSchema,
  reportSchema,
  bookmarkSchema,
  shareSchema,
  // Video queries/procedures
  getFeedSchema,
  getVideoSchema,
  getCommentsSchema,
  getSoundsSchema,
  getBookmarksSchema,
  searchSchema,
  uploadVideoSchema,
  completeUploadSchema,
  getUploadStatusSchema,
  getRepostsSchema,
  getLikesSchema,
  deleteVideoSchema,
  updateVideoSchema,
  deleteCommentSchema,
  getDuetsSchema,
  getStitchesSchema,
  getVideosBySoundSchema,
  getVideosByTagSchema,
  // Actor
  getProfileSchema,
  updateProfileSchema,
  getSuggestionsSchema,
  searchActorsSchema,
  getPreferencesSchema,
  putPreferencesSchema,
  // Graph records
  blockSchema,
  muteSchema,
  graphFollowSchema,
  listSchema,
  listItemSchema,
  // Graph queries
  getBlocksSchema,
  getMutesSchema,
  getFollowersSchema,
  getFollowingSchema,
  getListsSchema,
  getListSchema,
  // Notification
  notificationSubscriptionSchema,
  listNotificationsSchema,
  updateSeenSchema,
  getUnreadCountSchema,
  // Feed
  getTimelineSchema,
  getActorLikesSchema,
  getSuggestedFeedSchema,
  getActorFeedSchema,
  // Chat
  conversationSchema,
  messageSchema,
  getConversationsSchema,
  getMessagesSchema,
  deleteMessageSchema,
  deleteConversationSchema,
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
  VideoStitch: 'io.exprsn.video.stitch',
  VideoRepost: 'io.exprsn.video.repost',
  VideoReport: 'io.exprsn.video.report',
  VideoBookmark: 'io.exprsn.video.bookmark',
  VideoShare: 'io.exprsn.video.share',
  // Video queries/procedures
  GetFeed: 'io.exprsn.video.getFeed',
  GetVideo: 'io.exprsn.video.getVideo',
  GetComments: 'io.exprsn.video.getComments',
  GetSounds: 'io.exprsn.video.getSounds',
  GetBookmarks: 'io.exprsn.video.getBookmarks',
  Search: 'io.exprsn.video.search',
  UploadVideo: 'io.exprsn.video.uploadVideo',
  CompleteUpload: 'io.exprsn.video.completeUpload',
  GetUploadStatus: 'io.exprsn.video.getUploadStatus',
  GetReposts: 'io.exprsn.video.getReposts',
  GetLikes: 'io.exprsn.video.getLikes',
  DeleteVideo: 'io.exprsn.video.deleteVideo',
  UpdateVideo: 'io.exprsn.video.updateVideo',
  DeleteComment: 'io.exprsn.video.deleteComment',
  GetDuets: 'io.exprsn.video.getDuets',
  GetStitches: 'io.exprsn.video.getStitches',
  GetVideosBySound: 'io.exprsn.video.getVideosBySound',
  GetVideosByTag: 'io.exprsn.video.getVideosByTag',
  // Actor queries/procedures
  GetProfile: 'io.exprsn.actor.getProfile',
  UpdateProfile: 'io.exprsn.actor.updateProfile',
  GetSuggestions: 'io.exprsn.actor.getSuggestions',
  SearchActors: 'io.exprsn.actor.searchActors',
  GetPreferences: 'io.exprsn.actor.getPreferences',
  PutPreferences: 'io.exprsn.actor.putPreferences',
  // Graph records
  GraphBlock: 'io.exprsn.graph.block',
  GraphMute: 'io.exprsn.graph.mute',
  GraphFollow: 'io.exprsn.graph.follow',
  GraphList: 'io.exprsn.graph.list',
  GraphListItem: 'io.exprsn.graph.listItem',
  // Graph queries
  GetBlocks: 'io.exprsn.graph.getBlocks',
  GetMutes: 'io.exprsn.graph.getMutes',
  GetFollowers: 'io.exprsn.graph.getFollowers',
  GetFollowing: 'io.exprsn.graph.getFollowing',
  GetLists: 'io.exprsn.graph.getLists',
  GetList: 'io.exprsn.graph.getList',
  // Notification records
  NotificationSubscription: 'io.exprsn.notification.subscription',
  // Notification queries/procedures
  ListNotifications: 'io.exprsn.notification.listNotifications',
  UpdateSeen: 'io.exprsn.notification.updateSeen',
  GetUnreadCount: 'io.exprsn.notification.getUnreadCount',
  // Feed queries
  GetTimeline: 'io.exprsn.feed.getTimeline',
  GetActorLikes: 'io.exprsn.feed.getActorLikes',
  GetSuggestedFeed: 'io.exprsn.feed.getSuggestedFeed',
  GetActorFeed: 'io.exprsn.feed.getActorFeed',
  // Chat records
  ChatConversation: 'io.exprsn.chat.conversation',
  ChatMessage: 'io.exprsn.chat.message',
  // Chat queries/procedures
  GetConversations: 'io.exprsn.chat.getConversations',
  GetMessages: 'io.exprsn.chat.getMessages',
  DeleteMessage: 'io.exprsn.chat.deleteMessage',
  DeleteConversation: 'io.exprsn.chat.deleteConversation',
} as const;

// =============================================================================
// Type Definitions
// =============================================================================

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

export type VideoStitch = {
  $type: 'io.exprsn.video.stitch';
  video: VideoEmbed;
  originalVideo: StrongRef;
  stitchStart?: number;
  stitchEnd?: number;
  caption?: string;
  tags?: string[];
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

export type VideoShare = {
  $type: 'io.exprsn.video.share';
  subject: StrongRef;
  platform?: 'copy_link' | 'twitter' | 'facebook' | 'instagram' | 'whatsapp' | 'telegram' | 'email' | 'other';
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

export type GraphFollow = {
  $type: 'io.exprsn.graph.follow';
  subject: string;
  createdAt: string;
};

export type GraphList = {
  $type: 'io.exprsn.graph.list';
  name: string;
  purpose: 'curatelist' | 'modlist';
  description?: string;
  avatar?: BlobRef;
  createdAt: string;
};

export type GraphListItem = {
  $type: 'io.exprsn.graph.listItem';
  subject: string;
  list: string;
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

export type Notification = {
  uri: string;
  cid: string;
  author: ProfileViewBasic;
  reason: 'like' | 'comment' | 'follow' | 'mention' | 'repost' | 'reply' | 'quote';
  reasonSubject?: string;
  record?: unknown;
  isRead: boolean;
  indexedAt: string;
};

export type ProfileViewBasic = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  verified?: boolean;
};

export type ProfileView = ProfileViewBasic & {
  bio?: string;
  banner?: string;
  followerCount?: number;
  followingCount?: number;
  videoCount?: number;
  likeCount?: number;
  createdAt?: string;
  viewer?: {
    following?: boolean;
    followedBy?: boolean;
    followUri?: string;
    muted?: boolean;
    blocked?: boolean;
    blockUri?: string;
  };
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

export type FeedViewPost = {
  post: VideoView;
  reason?: RepostReason;
};

export type VideoView = {
  uri: string;
  cid: string;
  author: ProfileViewBasic;
  video: VideoEmbed;
  caption?: string;
  tags?: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  repostCount: number;
  bookmarkCount: number;
  createdAt: string;
  indexedAt: string;
  viewer?: {
    liked?: boolean;
    likeUri?: string;
    reposted?: boolean;
    repostUri?: string;
    bookmarked?: boolean;
    bookmarkUri?: string;
  };
};

export type RepostReason = {
  $type: 'io.exprsn.feed.getTimeline#reasonRepost';
  by: ProfileViewBasic;
  indexedAt: string;
};

export type SoundView = {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
  coverUrl?: string;
  audioUrl?: string;
  useCount: number;
  originalVideo?: VideoView;
};

export type TagView = {
  name: string;
  videoCount: number;
  viewCount?: number;
};

export type ListView = {
  uri: string;
  cid: string;
  creator: ProfileView;
  name: string;
  purpose: 'curatelist' | 'modlist';
  description?: string;
  avatar?: string;
  memberCount?: number;
  indexedAt: string;
  viewer?: {
    muted?: boolean;
    blocked?: boolean;
  };
};

export type ListItemView = {
  uri: string;
  subject: ProfileView;
};

export type Preferences = Array<
  | AdultContentPref
  | ContentLabelPref
  | FeedViewPref
  | ThreadViewPref
  | InterestsPref
  | MutedWordsPref
  | HiddenPostsPref
>;

export type AdultContentPref = {
  $type: 'io.exprsn.actor.getPreferences#adultContentPref';
  enabled: boolean;
};

export type ContentLabelPref = {
  $type: 'io.exprsn.actor.getPreferences#contentLabelPref';
  label: string;
  visibility: 'show' | 'warn' | 'hide';
};

export type FeedViewPref = {
  $type: 'io.exprsn.actor.getPreferences#feedViewPref';
  feed: string;
  hideReplies?: boolean;
  hideReposts?: boolean;
  hideQuotePosts?: boolean;
};

export type ThreadViewPref = {
  $type: 'io.exprsn.actor.getPreferences#threadViewPref';
  sort?: 'oldest' | 'newest' | 'most-likes' | 'random';
  prioritizeFollowedUsers?: boolean;
};

export type InterestsPref = {
  $type: 'io.exprsn.actor.getPreferences#interestsPref';
  tags: string[];
};

export type MutedWordsPref = {
  $type: 'io.exprsn.actor.getPreferences#mutedWordsPref';
  items: MutedWord[];
};

export type MutedWord = {
  value: string;
  targets: Array<'content' | 'tag'>;
};

export type HiddenPostsPref = {
  $type: 'io.exprsn.actor.getPreferences#hiddenPostsPref';
  items: string[];
};

// =============================================================================
// Schema Exports
// =============================================================================

// Video
export { postSchema, likeSchema, commentSchema, videoFollowSchema, soundSchema, duetSchema, stitchSchema };
export { repostSchema, reportSchema, bookmarkSchema, shareSchema };
export { getFeedSchema, getVideoSchema, getCommentsSchema, getSoundsSchema, getBookmarksSchema };
export { searchSchema, uploadVideoSchema, completeUploadSchema, getUploadStatusSchema };
export { getRepostsSchema, getLikesSchema, deleteVideoSchema, updateVideoSchema, deleteCommentSchema };
export { getDuetsSchema, getStitchesSchema, getVideosBySoundSchema, getVideosByTagSchema };

// Actor
export { getProfileSchema, updateProfileSchema, getSuggestionsSchema, searchActorsSchema };
export { getPreferencesSchema, putPreferencesSchema };

// Graph
export { blockSchema, muteSchema, graphFollowSchema, listSchema, listItemSchema };
export { getBlocksSchema, getMutesSchema, getFollowersSchema, getFollowingSchema, getListsSchema, getListSchema };

// Notification
export { notificationSubscriptionSchema, listNotificationsSchema, updateSeenSchema, getUnreadCountSchema };

// Feed
export { getTimelineSchema, getActorLikesSchema, getSuggestedFeedSchema, getActorFeedSchema };

// Chat
export { conversationSchema, messageSchema, getConversationsSchema, getMessagesSchema };
export { deleteMessageSchema, deleteConversationSchema };
