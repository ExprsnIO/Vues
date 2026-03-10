# Social Features Quick Start Guide

## Overview

This guide helps you quickly integrate the new social features into your components.

## 1. Comment Emoji Reactions

### Basic Usage

```tsx
import { CommentEmojiPicker } from '@/components/comments';

function MyComment() {
  const [currentEmoji, setCurrentEmoji] = useState<CommentEmojiType>();
  const [emojiCounts, setEmojiCounts] = useState({
    heart: 0,
    laugh: 0,
    wow: 0,
    sad: 0,
    angry: 0,
    clap: 0,
  });

  const handleEmojiReact = async (emojiType: CommentEmojiType) => {
    // Call API
    await api.addCommentEmoji(commentUri, emojiType);
    // Update state
  };

  return (
    <CommentEmojiPicker
      currentEmoji={currentEmoji}
      counts={emojiCounts}
      onReact={handleEmojiReact}
      disabled={!user}
      compact={false} // Set to true for inline display
    />
  );
}
```

### Available Emojis

- `heart` - ❤️ Heart
- `laugh` - 😂 Laugh
- `wow` - 😮 Wow
- `sad` - 😢 Sad
- `angry` - 😡 Angry
- `clap` - 👏 Clap

## 2. @Mentions

### In Comment Input

```tsx
import { CommentInput } from '@/components/comments';

function MyCommentSection() {
  const handleSubmit = (text: string) => {
    // text may contain @mentions like "@alice @bob check this out!"
    api.createComment(videoUri, text);
  };

  return (
    <CommentInput
      onSubmit={handleSubmit}
      placeholder="Add a comment..."
    />
  );
  // Mentions autocomplete is built-in!
}
```

### Rendering Mentions

```tsx
import { CommentText } from '@/components/comments';

function MyComment({ comment }) {
  return (
    <div>
      <CommentText text={comment.text} />
      {/* Automatically renders @mentions as clickable links */}
    </div>
  );
}
```

### Mention Utilities

```tsx
import {
  extractMentions,
  hasMentions,
  isValidHandle,
  extractValidMentions,
} from '@/lib/mention-utils';

const text = "Hey @alice and @bob, check this out!";

extractMentions(text);
// => ['alice', 'bob']

hasMentions(text);
// => true

isValidHandle('alice');
// => true

extractValidMentions(text);
// => ['alice', 'bob'] (only valid handles)
```

## 3. Comment Pinning

### In CommentItem

Already integrated! Just pass the required props:

```tsx
import { CommentItem } from '@/components/comments';

function MyCommentList({ comments, videoUri, videoAuthorDid }) {
  return (
    <>
      {comments.map(comment => (
        <CommentItem
          key={comment.uri}
          comment={comment}
          videoUri={videoUri}
          videoAuthorDid={videoAuthorDid}
          // ... other props
        />
      ))}
    </>
  );
}
```

### Pin/Unpin API

```tsx
// Pin a comment (video owner only)
await api.pinComment(commentUri, videoUri);

// Unpin current pinned comment
await api.unpinComment(videoUri);
```

## 4. Enhanced Share Sheet

### Basic Usage

```tsx
import { ShareModal } from '@/components/ShareModal';

function MyVideoPlayer({ video }) {
  const [showShare, setShowShare] = useState(false);

  return (
    <>
      <button onClick={() => setShowShare(true)}>
        Share
      </button>

      <ShareModal
        isOpen={showShare}
        onClose={() => setShowShare(false)}
        video={video}
        userHandle={currentUser?.handle}
      />
    </>
  );
}
```

### Features Included

- Copy link to clipboard
- Generate QR code
- Share to social platforms (Twitter, Facebook, LinkedIn, WhatsApp, Telegram, Reddit)
- Copy embed code
- Automatic share tracking

### Manual Share Tracking

```tsx
// Track custom share actions
await api.trackShare(videoUri, 'custom_platform');
```

## Complete Example: Comment Thread

```tsx
import {
  CommentThread,
  CommentItem,
  CommentInput,
  CommentEmojiPicker,
} from '@/components/comments';
import { ShareModal } from '@/components/ShareModal';

function VideoComments({ video }) {
  return (
    <CommentThread
      videoUri={video.uri}
      videoAuthorDid={video.author.did}
      inline={false}
      position="side"
    />
  );
  // This includes:
  // - Emoji reactions
  // - @Mentions
  // - Comment pinning (if you're the video owner)
  // - All existing features (replies, sorting, etc.)
}
```

## API Integration Checklist

### Required Backend Endpoints

- [x] `POST /xrpc/io.exprsn.video.addCommentEmoji`
- [x] `POST /xrpc/io.exprsn.video.removeCommentEmoji`
- [x] `POST /xrpc/io.exprsn.video.pinComment`
- [x] `POST /xrpc/io.exprsn.video.unpinComment`
- [x] `GET /xrpc/io.exprsn.actor.searchUsers` (existing)
- [x] `POST /xrpc/io.exprsn.video.share` (existing - trackShare)

### CommentView Type Updates

Ensure your backend returns:

```typescript
{
  uri: string;
  text: string;
  isPinned?: boolean;
  emojiCounts?: {
    heart: number;
    laugh: number;
    wow: number;
    sad: number;
    angry: number;
    clap: number;
  };
  viewer?: {
    reaction?: 'like' | 'love' | 'dislike';
    emoji?: 'heart' | 'laugh' | 'wow' | 'sad' | 'angry' | 'clap';
  };
  // ... other fields
}
```

## Styling

All components use TailwindCSS and respect the app's theme:

- Dark mode compatible
- Accent colors for interactive elements
- Surface colors for backgrounds
- Proper text hierarchy
- Responsive design
- Accessibility compliant

## Keyboard Shortcuts

### Mention Autocomplete
- `ArrowDown` - Next suggestion
- `ArrowUp` - Previous suggestion
- `Enter` - Select suggestion
- `Escape` - Close suggestions

### Share Modal
- `Escape` - Close modal

## Accessibility

All features include:
- ARIA labels
- Keyboard navigation
- Focus management
- Screen reader support
- High contrast support
- Reduced motion support

## Performance Tips

1. **Mention Search**: Automatically debounced (300ms)
2. **Emoji Reactions**: Optimistic UI updates
3. **QR Codes**: Generated lazily on modal open
4. **Share Tracking**: Fire and forget (doesn't block UI)

## Common Patterns

### Check if user can pin comments

```tsx
const canPin = user?.did === video.author.did;
```

### Handle mention notifications

```tsx
// Extract mentions from new comment
const mentions = extractValidMentions(commentText);

// Send notifications to mentioned users
mentions.forEach(handle => {
  sendNotification(handle, {
    type: 'mention',
    commentUri,
    videoUri,
  });
});
```

### Track share analytics

```tsx
// Already built-in to ShareModal
// Manual tracking:
await api.trackShare(videoUri, 'copy_link');
```

## Troubleshooting

### Mentions not showing suggestions
- Check that `api.searchUsers()` is working
- Verify user typed `@` followed by text
- Check network tab for API calls

### Emoji reactions not updating
- Verify API endpoints are implemented
- Check authentication status
- Look for console errors

### Share modal QR code not loading
- Check external QR code API availability
- Verify URL encoding is correct
- Check CORS settings if using custom API

### Pinning not working
- Verify user is video owner
- Check `videoAuthorDid` prop is passed
- Ensure only one comment is pinned per video

## Migration from Old Share

If you were using the old share functionality:

```tsx
// OLD
import { useVideoShare } from '@/hooks/useVideoShare';
const { share } = useVideoShare({ video, user });
<button onClick={share}>Share</button>

// NEW
import { ShareModal } from '@/components/ShareModal';
const [showShare, setShowShare] = useState(false);
<button onClick={() => setShowShare(true)}>Share</button>
<ShareModal isOpen={showShare} onClose={() => setShowShare(false)} video={video} />
```

The `useVideoShare` hook still exists for simple share functionality, but the modal provides a much richer experience.

## Questions?

Refer to the full implementation documentation in `SOCIAL_FEATURES_IMPLEMENTATION.md`
