import { JetstreamConsumer } from './subscription/jetstream.js';
import { TrendingCalculator } from './algorithms/trending.js';
import { TrendingSoundsCalculator } from './algorithms/trendingSounds.js';
import { ChallengeLeaderboardCalculator } from './algorithms/challengeLeaderboard.js';
import { UserPreferencesCalculator } from './algorithms/userPreferences.js';
import { COLLECTIONS } from '@exprsn/shared';

async function main() {
  console.log('Starting Exprsn Feed Generator...');

  // Start Jetstream consumer for real-time indexing
  const consumer = new JetstreamConsumer([
    COLLECTIONS.VIDEO_POST,
    COLLECTIONS.VIDEO_LIKE,
    COLLECTIONS.VIDEO_COMMENT,
    COLLECTIONS.VIDEO_FOLLOW,
  ]);

  await consumer.start();
  console.log('Jetstream consumer started');

  // Start trending calculator cron job
  const trendingCalculator = new TrendingCalculator();
  trendingCalculator.start();
  console.log('Trending calculator started');

  // Start trending sounds calculator cron job
  const trendingSoundsCalculator = new TrendingSoundsCalculator();
  trendingSoundsCalculator.start();
  console.log('Trending sounds calculator started');

  // Start challenge leaderboard calculator cron job
  const challengeLeaderboardCalculator = new ChallengeLeaderboardCalculator();
  challengeLeaderboardCalculator.start();
  console.log('Challenge leaderboard calculator started');

  // Start user preferences calculator cron job (for FYP personalization)
  const userPreferencesCalculator = new UserPreferencesCalculator();
  userPreferencesCalculator.start();
  console.log('User preferences calculator started');

  // Handle shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    consumer.stop();
    trendingCalculator.stop();
    trendingSoundsCalculator.stop();
    challengeLeaderboardCalculator.stop();
    userPreferencesCalculator.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    consumer.stop();
    trendingCalculator.stop();
    trendingSoundsCalculator.stop();
    challengeLeaderboardCalculator.stop();
    userPreferencesCalculator.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start feed generator:', err);
  process.exit(1);
});
