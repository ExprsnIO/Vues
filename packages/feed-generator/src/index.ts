import { JetstreamConsumer } from './subscription/jetstream.js';
import { TrendingCalculator } from './algorithms/trending.js';
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

  // Handle shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    consumer.stop();
    trendingCalculator.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    consumer.stop();
    trendingCalculator.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start feed generator:', err);
  process.exit(1);
});
