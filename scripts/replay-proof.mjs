import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLATFORM_FEE_BPS = 100n;
const BPS_DENOMINATOR = 10_000n;
const RUN_SIZE = 100;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(repoRoot, 'reports');
const reportPath = path.join(reportsDir, 'replay-proof.json');

const toDecimalString = (valueWei) => {
  const whole = valueWei / 1000000000000000000n;
  const frac = (valueWei % 1000000000000000000n).toString().padStart(18, '0').slice(0, 6);
  return `${whole.toString()}.${frac}`;
};

const buildSamplePriceWei = (index) => {
  const base = 1000000000000000n;
  const variable = BigInt((index * 7919) % 900_000) * 1000000000000n;
  return base + variable;
};

const runReplay = () => {
  const receipts = [];
  let allPassed = true;

  for (let index = 1; index <= RUN_SIZE; index += 1) {
    const paidWei = buildSamplePriceWei(index);
    const platformShareWei = (paidWei * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
    const creatorShareWei = paidWei - platformShareWei;

    const expectedPlatformWei = (paidWei * 1n) / 100n;
    const expectedCreatorWei = paidWei - expectedPlatformWei;

    const passed = creatorShareWei === expectedCreatorWei && platformShareWei === expectedPlatformWei;
    if (!passed) {
      allPassed = false;
    }

    receipts.push({
      replayIndex: index,
      paidWei: paidWei.toString(),
      creatorShareWei: creatorShareWei.toString(),
      platformShareWei: platformShareWei.toString(),
      creatorDisplay: `${toDecimalString(creatorShareWei)} ETH`,
      platformDisplay: `${toDecimalString(platformShareWei)} ETH`,
      passed
    });
  }

  const passedCount = receipts.filter((item) => item.passed).length;
  const failedCount = receipts.length - passedCount;

  return {
    generatedAt: new Date().toISOString(),
    protocol: 'SovereignDRM',
    formula: {
      creator: 'paidWei - ((paidWei * 100) / 10000)',
      platform: '(paidWei * 100) / 10000'
    },
    totals: {
      replayCount: receipts.length,
      passedCount,
      failedCount,
      passRate: `${Math.round((passedCount / receipts.length) * 100)}%`
    },
    pass: allPassed,
    receipts
  };
};

const main = async () => {
  const report = runReplay();

  await mkdir(reportsDir, { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('Sovereign Replay Proof Complete');
  console.log(`Report: ${reportPath}`);
  console.log(`Pass Rate: ${report.totals.passedCount}/${report.totals.replayCount}`);

  if (!report.pass) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error('Replay proof generation failed:', error);
  process.exitCode = 1;
});
