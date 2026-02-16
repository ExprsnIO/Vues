import { Lexicons } from '@atproto/lexicon';
import postSchema from '../schemas/io/exprsn/video/post.json' with { type: 'json' };
import likeSchema from '../schemas/io/exprsn/video/like.json' with { type: 'json' };
import commentSchema from '../schemas/io/exprsn/video/comment.json' with { type: 'json' };
import followSchema from '../schemas/io/exprsn/video/follow.json' with { type: 'json' };
import soundSchema from '../schemas/io/exprsn/video/sound.json' with { type: 'json' };
import duetSchema from '../schemas/io/exprsn/video/duet.json' with { type: 'json' };
import getFeedSchema from '../schemas/io/exprsn/video/getFeed.json' with { type: 'json' };
import getVideoSchema from '../schemas/io/exprsn/video/getVideo.json' with { type: 'json' };
import getCommentsSchema from '../schemas/io/exprsn/video/getComments.json' with { type: 'json' };
import getSoundsSchema from '../schemas/io/exprsn/video/getSounds.json' with { type: 'json' };
import searchSchema from '../schemas/io/exprsn/video/search.json' with { type: 'json' };
import uploadVideoSchema from '../schemas/io/exprsn/video/uploadVideo.json' with { type: 'json' };
import completeUploadSchema from '../schemas/io/exprsn/video/completeUpload.json' with { type: 'json' };
import getUploadStatusSchema from '../schemas/io/exprsn/video/getUploadStatus.json' with { type: 'json' };

export const schemas = [
  postSchema,
  likeSchema,
  commentSchema,
  followSchema,
  soundSchema,
  duetSchema,
  getFeedSchema,
  getVideoSchema,
  getCommentsSchema,
  getSoundsSchema,
  searchSchema,
  uploadVideoSchema,
  completeUploadSchema,
  getUploadStatusSchema,
] as const;

export const lexicons = new Lexicons(schemas as unknown as Parameters<Lexicons['add']>[0][]);

export const NSID = {
  VideoPost: 'io.exprsn.video.post',
  VideoLike: 'io.exprsn.video.like',
  VideoComment: 'io.exprsn.video.comment',
  VideoFollow: 'io.exprsn.video.follow',
  VideoSound: 'io.exprsn.video.sound',
  VideoDuet: 'io.exprsn.video.duet',
  GetFeed: 'io.exprsn.video.getFeed',
  GetVideo: 'io.exprsn.video.getVideo',
  GetComments: 'io.exprsn.video.getComments',
  GetSounds: 'io.exprsn.video.getSounds',
  Search: 'io.exprsn.video.search',
  UploadVideo: 'io.exprsn.video.uploadVideo',
  CompleteUpload: 'io.exprsn.video.completeUpload',
  GetUploadStatus: 'io.exprsn.video.getUploadStatus',
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

export type StrongRef = {
  uri: string;
  cid: string;
};

export { postSchema, likeSchema, commentSchema, followSchema, soundSchema, duetSchema };
export {
  getFeedSchema,
  getVideoSchema,
  getCommentsSchema,
  getSoundsSchema,
  searchSchema,
  uploadVideoSchema,
  completeUploadSchema,
  getUploadStatusSchema,
};
