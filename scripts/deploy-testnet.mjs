import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(repoRoot, 'reports');
const reportPath = path.join(reportsDir, 'deployment-testnet.json');

const REQUIRED_ENV = ['DEPLOY_RPC_URL', 'DEPLOY_PRIVATE_KEY', 'DEPLOY_TREASURY'];

const getMissingEnv = () => REQUIRED_ENV.filter((key) => !process.env[key]);

const compileContract = async () => {
  const contractPath = path.join(repoRoot, 'contracts', 'SovereignDRM.sol');
  const source = await readFile(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      'SovereignDRM.sol': { content: source }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object']
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((entry) => entry.severity === 'error');
  if (errors.length) {
    throw new Error(errors.map((entry) => entry.formattedMessage).join('\n\n'));
  }

  const artifact = output.contracts?.['SovereignDRM.sol']?.SovereignDRM;
  if (!artifact?.abi || !artifact?.evm?.bytecode?.object) {
    throw new Error('Compiled artifact missing ABI or bytecode.');
  }

  return {
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`
  };
};

const run = async () => {
  const report = {
    generatedAt: new Date().toISOString(),
    pass: false,
    network: null,
    contractAddress: null,
    deployTxHash: null,
    explorerUrl: null,
    treasury: process.env.DEPLOY_TREASURY || null,
    error: null
  };

  const missing = getMissingEnv();
  if (missing.length > 0) {
    report.error = `Missing required environment variables: ${missing.join(', ')}`;
    await mkdir(reportsDir, { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    throw new Error(report.error);
  }

  const { abi, bytecode } = await compileContract();

  const provider = new ethers.providers.JsonRpcProvider(process.env.DEPLOY_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOY_PRIVATE_KEY, provider);
  const network = await provider.getNetwork();

  report.network = { name: network.name, chainId: network.chainId };

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(process.env.DEPLOY_TREASURY);
  const receipt = await contract.deployTransaction.wait();

  report.contractAddress = contract.address;
  report.deployTxHash = receipt.transactionHash;
  report.pass = true;

  if (network.chainId === 11155111) {
    report.explorerUrl = `https://sepolia.etherscan.io/address/${contract.address}`;
  } else if (network.chainId === 84532) {
    report.explorerUrl = `https://sepolia.basescan.org/address/${contract.address}`;
  }

  await mkdir(reportsDir, { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('Sovereign Testnet Deployment Complete');
  console.log(`Contract Address: ${report.contractAddress}`);
  console.log(`Deploy Tx: ${report.deployTxHash}`);
  if (report.explorerUrl) {
    console.log(`Explorer: ${report.explorerUrl}`);
  }
};

run().catch(async (error) => {
  const failReport = {
    generatedAt: new Date().toISOString(),
    pass: false,
    error: error.message
  };
  await mkdir(reportsDir, { recursive: true });
  await writeFile(reportPath, JSON.stringify(failReport, null, 2), 'utf8');
  console.error('Deployment failed:', error.message);
  process.exitCode = 1;
});
