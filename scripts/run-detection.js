require('dotenv').config();

const { runDetectionCycle } = require('../src/services/detectReviews');

async function main() {
  await runDetectionCycle();
  process.exit(0);
}

main().catch((err) => {
  console.error('[DETECTION SCRIPT ERROR]', err);
  process.exit(1);
});
