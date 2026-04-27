import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(repoRoot, 'reports');
const reportPath = path.join(reportsDir, 'replay-proof-live.json');

const REQUIRED_ENV = [
  'REPLAY_RPC_URL',
  'REPLAY_PRIVATE_KEY',
  'REPLAY_CONTRACT_ADDRESS'
];

const contractAbi = [
  'function PLATFORM_FEE_BPS() view returns (uint256)',
  'function BPS_DENOMINATOR() view returns (uint256)',
  'function listContent(string ipfsCid, uint256 priceWei) returns (uint256 contentId)',
  'function purchaseContent(uint256 contentId) payable',
  'event ContentListed(uint256 indexed contentId, address indexed creator, string ipfsCid, uint256 priceWei)',
  'event FundsDistributed(uint256 indexed contentId, address indexed creator, uint256 creatorShare, uint256 treasuryShare)'
];

const getMissingEnv = () => REQUIRED_ENV.filter((key) => !process.env[key]);

const toDisplayEth = (ethersLib, value) => `${ethersLib.utils.formatEther(value)} ETH`;

const run = async () => {
  let ethers;
  try {
    ({ ethers } = await import('ethers'));
  } catch {
    const dependencyReport = {
      generatedAt: new Date().toISOString(),
      pass: false,
      error: 'Missing dependency: ethers. Install dependencies before running live replay proof.',
      summary: {
        attempted: 0,
        passed: 0,
        failed: 0
      }
    };

    await mkdir(reportsDir, { recursive: true });
    await writeFile(reportPath, JSON.stringify(dependencyReport, null, 2), 'utf8');
    throw new Error(dependencyReport.error);
  }

  const missingEnv = getMissingEnv();

  const report = {
    generatedAt: new Date().toISOString(),
    network: null,
    runCount: Number(process.env.REPLAY_RUN_COUNT || 100),
    contractAddress: process.env.REPLAY_CONTRACT_ADDRESS || null,
    walletAddress: null,
    pass: false,
    summary: {
      attempted: 0,
      passed: 0,
      failed: 0
    },
    environment: {
      missing: missingEnv
    },
    txs: []
  };

  if (missingEnv.length > 0) {
    report.error = `Missing required environment variables: ${missingEnv.join(', ')}`;
    await mkdir(reportsDir, { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    throw new Error(report.error);
  }

  const provider = new ethers.providers.JsonRpcProvider(process.env.REPLAY_RPC_URL);
  const wallet = new ethers.Wallet(process.env.REPLAY_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(process.env.REPLAY_CONTRACT_ADDRESS, contractAbi, wallet);

  report.walletAddress = wallet.address;

  const network = await provider.getNetwork();
  report.network = {
    chainId: network.chainId,
    name: network.name
  };

  const feeBps = await contract.PLATFORM_FEE_BPS();
  const bpsDenominator = await contract.BPS_DENOMINATOR();

  for (let index = 1; index <= report.runCount; index += 1) {
    const replayEntry = {
      replayIndex: index,
      listTxHash: null,
      purchaseTxHash: null,
      contentId: null,
      priceWei: null,
      creatorShareWei: null,
      platformShareWei: null,
      pass: false,
      error: null
    };

    try {
      const priceWei = ethers.utils.parseUnits((0.001 + index * 0.00001).toFixed(6), 'ether');
      replayEntry.priceWei = priceWei.toString();

      const cid = `sovereign-live-replay-${Date.now()}-${index}`;
      const listTx = await contract.listContent(cid, priceWei);
      replayEntry.listTxHash = listTx.hash;
      const listReceipt = await listTx.wait();

      const listedEvent = listReceipt.events?.find((event) => event.event === 'ContentListed');
      if (!listedEvent) {
        throw new Error('Missing ContentListed event');
      }

      const contentId = listedEvent.args.contentId;
      replayEntry.contentId = contentId.toString();

      const purchaseTx = await contract.purchaseContent(contentId, { value: priceWei });
      replayEntry.purchaseTxHash = purchaseTx.hash;
      const purchaseReceipt = await purchaseTx.wait();

      const fundsEvent = purchaseReceipt.events?.find((event) => event.event === 'FundsDistributed');
      if (!fundsEvent) {
        throw new Error('Missing FundsDistributed event');
      }

      const creatorShareWei = fundsEvent.args.creatorShare;
      const platformShareWei = fundsEvent.args.treasuryShare;

      replayEntry.creatorShareWei = creatorShareWei.toString();
      replayEntry.platformShareWei = platformShareWei.toString();

      const expectedPlatform = priceWei.mul(feeBps).div(bpsDenominator);
      const expectedCreator = priceWei.sub(expectedPlatform);

      replayEntry.pass = creatorShareWei.eq(expectedCreator) && platformShareWei.eq(expectedPlatform);

      replayEntry.display = {
        price: toDisplayEth(ethers, priceWei),
        creator: toDisplayEth(ethers, creatorShareWei),
        platform: toDisplayEth(ethers, platformShareWei)
      };

      report.summary.attempted += 1;
      if (replayEntry.pass) {
        report.summary.passed += 1;
      } else {
        report.summary.failed += 1;
      }
    } catch (error) {
      replayEntry.error = error.message;
      report.summary.attempted += 1;
      report.summary.failed += 1;
    }

    report.txs.push(replayEntry);
  }

  report.pass = report.summary.failed === 0 && report.summary.passed === report.runCount;

  await mkdir(reportsDir, { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('Sovereign Live Replay Proof Complete');
  console.log(`Report: ${reportPath}`);
  console.log(`Pass Rate: ${report.summary.passed}/${report.summary.attempted}`);

  if (!report.pass) {
    process.exitCode = 1;
  }
};

run().catch(async (error) => {
  console.error('Live replay proof failed:', error.message);
  process.exitCode = 1;
});
