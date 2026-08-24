import { scheduleVerifyRunStats, verifyRunStatsPath } from '../../run-stats/verify-run-stats.ts';
import { readTextFile } from '../../../process/files/files.ts';

const workerId = Number(process.argv[2]);
const record = { t: 2, r: 0, ms: workerId, path: `/worker-${workerId}` };
scheduleVerifyRunStats(record);

const statsPath = verifyRunStatsPath();
const deadline = Date.now() + 5000;
while (Date.now() < deadline) {
  try {
    const content = await readTextFile(statsPath);
    if (content.split('\n').some((line) => line.includes(`"/worker-${workerId}"`))) {
      process.exit(0);
    }
  } catch {
    // not written yet
  }
  await new Promise((resolveWait) => {
    setTimeout(resolveWait, 5);
  });
}
process.exit(1);
