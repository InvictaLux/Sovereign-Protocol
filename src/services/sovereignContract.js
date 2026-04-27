const PURCHASE_SIGNATURE = 'purchaseContent(uint256)';
const LIST_SIGNATURE = 'listContent(string,uint256)';
const CONTENT_LISTED_EVENT = 'ContentListed(uint256,address,string,uint256)';
const RECEIPT_POLL_INTERVAL_MS = 1500;
const RECEIPT_TIMEOUT_MS = 180000;

const utf8ToHex = (value) => {
  const bytes = new TextEncoder().encode(value);
  return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
};

const toHexQuantity = (value) => `0x${BigInt(value).toString(16)}`;

const encodeUint256 = (value) => BigInt(value).toString(16).padStart(64, '0');

const padRightToWordHex = (hex) => {
  const remainder = hex.length % 64;
  if (remainder === 0) {
    return hex;
  }

  return `${hex}${'0'.repeat(64 - remainder)}`;
};

const ensureProvider = () => {
  if (!window.ethereum) {
    throw new Error('MetaMask (or an EIP-1193 wallet) is required for on-chain purchases.');
  }

  return window.ethereum;
};

const getPurchaseSelector = async (provider) => {
  const digest = await provider.request({
    method: 'web3_sha3',
    params: [utf8ToHex(PURCHASE_SIGNATURE)]
  });

  if (!digest || typeof digest !== 'string' || !digest.startsWith('0x') || digest.length < 10) {
    throw new Error('Failed to derive purchaseContent selector from wallet provider.');
  }

  return digest.slice(0, 10);
};

const getListSelector = async (provider) => {
  const digest = await provider.request({
    method: 'web3_sha3',
    params: [utf8ToHex(LIST_SIGNATURE)]
  });

  if (!digest || typeof digest !== 'string' || !digest.startsWith('0x') || digest.length < 10) {
    throw new Error('Failed to derive listContent selector from wallet provider.');
  }

  return digest.slice(0, 10);
};

const buildListContentCalldata = ({ selector, ipfsCid, priceWei }) => {
  const cidHex = utf8ToHex(ipfsCid).slice(2);
  const cidLengthWords = encodeUint256(new TextEncoder().encode(ipfsCid).length);
  const cidDataWords = padRightToWordHex(cidHex);

  const head = `${encodeUint256(64)}${encodeUint256(priceWei)}`;
  const tail = `${cidLengthWords}${cidDataWords}`;

  return `${selector}${head}${tail}`;
};

const parseListedContentIdFromReceipt = async ({ provider, receipt }) => {
  const eventHash = await provider.request({
    method: 'web3_sha3',
    params: [utf8ToHex(CONTENT_LISTED_EVENT)]
  });

  const contentListedLog = receipt?.logs?.find((log) =>
    Array.isArray(log?.topics) && log.topics[0]?.toLowerCase() === eventHash?.toLowerCase()
  );

  if (!contentListedLog || !contentListedLog.topics?.[1]) {
    throw new Error('ContentListed event was not found in transaction receipt.');
  }

  return BigInt(contentListedLog.topics[1]).toString();
};

const waitForReceipt = async (provider, txHash) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < RECEIPT_TIMEOUT_MS) {
    const receipt = await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash]
    });

    if (receipt) {
      return receipt;
    }

    await new Promise((resolve) => setTimeout(resolve, RECEIPT_POLL_INTERVAL_MS));
  }

  throw new Error('Transaction pending too long. Confirmation timeout reached.');
};

const normalizeAddress = (address) => (typeof address === 'string' ? address.toLowerCase() : '');

export const parseEthToWei = (ethAmount) => {
  if (typeof ethAmount !== 'string' && typeof ethAmount !== 'number') {
    throw new Error('Invalid ETH amount format.');
  }

  const normalized = String(ethAmount).trim();
  if (!/^\d+(\.\d{1,18})?$/.test(normalized)) {
    throw new Error('Price must be a valid ETH decimal with up to 18 decimals.');
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');
  const weiWhole = BigInt(wholePart || '0') * 10n ** 18n;
  const weiFraction = BigInt((fractionPart + '0'.repeat(18)).slice(0, 18));
  const wei = weiWhole + weiFraction;

  if (wei <= 0n) {
    throw new Error('Price must be greater than zero.');
  }

  return wei.toString();
};

export const listContentOnChain = async ({
  ipfsCid,
  priceWei,
  contractAddress = import.meta.env.VITE_SOVEREIGN_CONTRACT_ADDRESS,
  expectedChainId = import.meta.env.VITE_SOVEREIGN_CHAIN_ID,
  onStatus
}) => {
  if (!ipfsCid) {
    throw new Error('Missing IPFS CID for on-chain listing.');
  }

  if (!contractAddress) {
    throw new Error('Missing contract address for listing.');
  }

  if (priceWei === undefined || priceWei === null) {
    throw new Error('Missing priceWei for listContent.');
  }

  const provider = ensureProvider();
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const creatorAddress = accounts?.[0];

  if (!creatorAddress) {
    throw new Error('Wallet returned no creator account.');
  }

  const chainId = await provider.request({ method: 'eth_chainId' });
  if (expectedChainId && normalizeAddress(chainId) !== normalizeAddress(expectedChainId)) {
    throw new Error(`Wrong network. Expected chain ${expectedChainId}, got ${chainId}.`);
  }

  const selector = await getListSelector(provider);
  const calldata = buildListContentCalldata({ selector, ipfsCid, priceWei });

  onStatus?.('TX_PENDING');
  const txHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: creatorAddress,
        to: contractAddress,
        value: '0x0',
        data: calldata
      }
    ]
  });

  if (!txHash) {
    throw new Error('Wallet did not return transaction hash for listing.');
  }

  onStatus?.('MINTING_RIGHTS');
  const receipt = await waitForReceipt(provider, txHash);
  if (receipt?.status !== '0x1') {
    throw new Error(`listContent reverted on-chain: ${txHash}`);
  }

  const onchainContentId = await parseListedContentIdFromReceipt({ provider, receipt });
  onStatus?.('PROCEEDS_LOCKED_TO_WALLET');

  return {
    txHash,
    chainId,
    receipt,
    creatorAddress,
    contractAddress,
    onchainContentId,
    priceWei: priceWei.toString()
  };
};

export const purchaseAssetOnChain = async (asset, options = {}) => {
  const { onStatus } = options;

  if (!asset) {
    throw new Error('Missing asset payload for purchase.');
  }

  const contractAddress = asset.contract_address || import.meta.env.VITE_SOVEREIGN_CONTRACT_ADDRESS;
  const onchainContentId = asset.onchain_content_id;
  const priceWei = asset.price_wei;
  const expectedChainId = asset.chain_id || import.meta.env.VITE_SOVEREIGN_CHAIN_ID;

  if (!contractAddress) {
    throw new Error('Missing contract address for this asset.');
  }

  if (onchainContentId === undefined || onchainContentId === null) {
    throw new Error('Asset is not listed on-chain yet (missing onchain_content_id).');
  }

  if (priceWei === undefined || priceWei === null) {
    throw new Error('Asset is missing price_wei and cannot be purchased on-chain.');
  }

  onStatus?.('BIOMETRIC_AUTH');
  const provider = ensureProvider();
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const buyerAddress = accounts?.[0];

  if (!buyerAddress) {
    throw new Error('Wallet returned no active account.');
  }

  const chainId = await provider.request({ method: 'eth_chainId' });
  if (expectedChainId && normalizeAddress(chainId) !== normalizeAddress(expectedChainId)) {
    throw new Error(`Wrong network. Expected chain ${expectedChainId}, got ${chainId}.`);
  }

  const selector = await getPurchaseSelector(provider);
  const calldata = `${selector}${encodeUint256(onchainContentId)}`;

  onStatus?.('TX_PENDING');
  const txHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: buyerAddress,
        to: contractAddress,
        value: toHexQuantity(priceWei),
        data: calldata
      }
    ]
  });

  if (!txHash) {
    throw new Error('Wallet did not return a transaction hash.');
  }

  onStatus?.('DIRECT_SPLIT_PENDING');
  const receipt = await waitForReceipt(provider, txHash);
  if (receipt?.status !== '0x1') {
    throw new Error(`On-chain transaction reverted: ${txHash}`);
  }

  onStatus?.('DIRECT_SPLIT_CONFIRMED');

  return {
    txHash,
    receipt,
    buyerAddress,
    chainId,
    contractAddress,
    onchainContentId,
    priceWei: priceWei.toString()
  };
};
