const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions");
const logger = require("firebase-functions/logger");
const {create} = require("@pinata/sdk");
const admin = require("firebase-admin");
const ContentAddressing = require('./contentAddressing');

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

setGlobalOptions({ maxInstances: 10 });

const PURCHASE_FUNCTION_SIGNATURE = 'purchaseContent(uint256)';
const PLATFORM_FEE_BPS = BigInt(100);
const BPS_DENOMINATOR = BigInt(10000);

const normalize = (value) => (typeof value === 'string' ? value.toLowerCase() : '');

const utf8ToHex = (value) => `0x${Buffer.from(value, 'utf8').toString('hex')}`;

const encodeUint256 = (value) => BigInt(value).toString(16).padStart(64, '0');

const toHexPrefixed = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  return value.startsWith('0x') ? value : `0x${BigInt(value).toString(16)}`;
};

const buildExplorerTxUrl = ({ chainId, txHash }) => {
  const normalized = normalize(toHexPrefixed(chainId));
  const byChain = {
    '0xaa36a7': 'https://sepolia.etherscan.io/tx/',
    '0x1': 'https://etherscan.io/tx/',
    '0x89': 'https://polygonscan.com/tx/',
    '0xa': 'https://optimistic.etherscan.io/tx/',
    '0x2105': 'https://basescan.org/tx/'
  };

  const base = byChain[normalized] || byChain['0xaa36a7'];
  return `${base}${txHash}`;
};

const rpcCall = async (rpcUrl, method, params = []) => {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: Date.now(),
      jsonrpc: '2.0',
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || `RPC error from ${method}`);
  }

  return payload.result;
};

// DIRECT-TO-IPFS: Generate Presigned URL for direct upload
// No 10MB payload limit - frontend uploads directly to IPFS
exports.getIPFSPresignedURL = onCall(async (request) => {
  try {
    // Validate request
    if (!request.auth) {
      throw new Error('Authentication required');
    }

    const { fileName, fileSize, contentHash } = request.data;
    
    if (!fileName || !fileSize) {
      throw new Error('Missing required fields: fileName, fileSize');
    }

    logger.info(`Presigned URL request for user: ${request.auth.uid}, file: ${fileName}`);

    // STORAGE DENSITY: Check for duplicates before generating upload URL
    if (contentHash) {
      const contentAddressing = new ContentAddressing();
      const existingRecord = await contentAddressing.checkContentHash(contentHash);
      
      if (existingRecord) {
        logger.info(`Duplicate content found, returning existing CID: ${existingRecord.ipfsHash}`);
        return { 
          ipfsHash: existingRecord.ipfsHash, 
          contentHash,
          isDuplicate: true,
          uploadedAt: existingRecord.createdAt,
          skipUpload: true
        };
      }
    }

    // THE TOKEN: Generate real Pinata Scoped API Key
    const pinata = create({
      pinataApiKey: process.env.PINATA_API_KEY,
      pinataSecretKey: process.env.PINATA_SECRET_KEY,
    });
    
    // Generate Scoped API Key for single upload
    const scopedKeyData = {
      keyName: `sovereign-upload-${request.auth.uid}-${Date.now()}`,
      maxUses: 1, // Only valid for 1 upload
      permissions: {
        endpoints: {
          pinning: {
            pinFileToIPFS: true
          }
        }
      },
      expiresIn: 3600 // 1 hour expiration
    };
    
    const scopedKey = await pinata.generateScopedKey(scopedKeyData);
    
    logger.info(`Generated Scoped API Key for: ${fileName}`);

    return {
      uploadURL: `https://api.pinata.cloud/pinning/pinFileToIPFS`,
      scopedKey: scopedKey.key,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      maxFileSize: fileSize,
      skipUpload: false
    };

  } catch (error) {
    logger.error('Presigned URL generation failed:', error);
    throw new Error(`PRESIGNED_URL_ERROR: ${error.message}`, { cause: error });
  }
});

exports.verifyPurchaseAndGrantAccess = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { appId, assetId, txHash, buyerAddress, chainId } = request.data || {};

    if (!appId || !assetId || !txHash || !buyerAddress) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: appId, assetId, txHash, buyerAddress'
      );
    }

    const assetRef = firestore
      .collection('artifacts')
      .doc(appId)
      .collection('public')
      .doc('data')
      .collection('marketplace_items')
      .doc(assetId);

    const assetDoc = await assetRef.get();
    if (!assetDoc.exists) {
      throw new HttpsError('not-found', 'Asset not found');
    }

    const asset = assetDoc.data();
    const contractAddress = asset.contract_address;
    const onchainContentId = asset.onchain_content_id;
    const priceWei = asset.price_wei;

    if (!contractAddress || onchainContentId === undefined || onchainContentId === null || !priceWei) {
      throw new HttpsError('failed-precondition', 'Asset is missing on-chain listing fields');
    }

    const expectedChainId = asset.chain_id || process.env.SOVEREIGN_CHAIN_ID;
    if (expectedChainId && chainId && normalize(expectedChainId) !== normalize(chainId)) {
      throw new HttpsError('failed-precondition', `Wrong chain: expected ${expectedChainId}, got ${chainId}`);
    }

    const rpcUrl = process.env.ETH_RPC_URL;
    if (!rpcUrl) {
      throw new HttpsError('failed-precondition', 'ETH_RPC_URL is not configured');
    }

    const tx = await rpcCall(rpcUrl, 'eth_getTransactionByHash', [txHash]);
    const receipt = await rpcCall(rpcUrl, 'eth_getTransactionReceipt', [txHash]);

    if (!tx || !receipt) {
      throw new HttpsError('failed-precondition', 'Transaction is not yet indexed by the RPC endpoint');
    }

    if (receipt.status !== '0x1') {
      throw new HttpsError('failed-precondition', 'Transaction reverted on-chain');
    }

    if (normalize(tx.to) !== normalize(contractAddress)) {
      throw new HttpsError('permission-denied', 'Transaction target contract mismatch');
    }

    if (normalize(tx.from) !== normalize(buyerAddress)) {
      throw new HttpsError('permission-denied', 'Buyer address mismatch');
    }

    const selectorHash = await rpcCall(rpcUrl, 'web3_sha3', [utf8ToHex(PURCHASE_FUNCTION_SIGNATURE)]);
    const selector = selectorHash.slice(0, 10);
    const expectedInput = `${selector}${encodeUint256(onchainContentId)}`;

    if (normalize(tx.input) !== normalize(expectedInput)) {
      throw new HttpsError('failed-precondition', 'Transaction calldata does not match purchaseContent(contentId)');
    }

    if (BigInt(tx.value || '0x0') !== BigInt(priceWei)) {
      throw new HttpsError('failed-precondition', 'Transaction value does not match asset price_wei');
    }

    const libraryRef = firestore
      .collection('artifacts')
      .doc(appId)
      .collection('users')
      .doc(request.auth.uid)
      .collection('library')
      .doc(assetId);

    const effectiveChainId = chainId || expectedChainId || null;
    const paidWei = BigInt(tx.value || '0x0');
    const platformShareWei = (paidWei * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
    const creatorShareWei = paidWei - platformShareWei;
    const explorerUrl = buildExplorerTxUrl({ chainId: effectiveChainId, txHash });

    const creatorEarningsRef = firestore
      .collection('artifacts')
      .doc(appId)
      .collection('public')
      .doc('data')
      .collection('creator_earnings')
      .doc(asset.creatorAddress || asset.creator_address || 'unknown_creator');

    const creatorSalesRef = creatorEarningsRef
      .collection('recent_sales')
      .doc(txHash);

    const batch = firestore.batch();

    batch.set(libraryRef, {
      ...asset,
      id: assetId,
      acquiredAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'verified',
      onchain: {
        txHash,
        chainId: effectiveChainId,
        contractAddress,
        contentId: onchainContentId,
        buyerAddress: normalize(buyerAddress),
        receiptBlock: receipt.blockNumber || null
      }
    }, { merge: true });

    batch.set(assetRef, {
      sales_count: admin.firestore.FieldValue.increment(1),
      latest_sale_tx: txHash,
      latest_sale_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    batch.set(creatorEarningsRef, {
      creatorAddress: asset.creatorAddress || asset.creator_address || null,
      total_onchain_earnings_wei: admin.firestore.FieldValue.increment(creatorShareWei.toString()),
      total_platform_fee_wei: admin.firestore.FieldValue.increment(platformShareWei.toString()),
      total_sales_count: admin.firestore.FieldValue.increment(1),
      last_sale_tx: txHash,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    batch.set(creatorSalesRef, {
      txHash,
      assetId,
      title: asset.title || 'Untitled Asset',
      buyerAddress: normalize(buyerAddress),
      creatorShareWei: creatorShareWei.toString(),
      platformShareWei: platformShareWei.toString(),
      paidWei: paidWei.toString(),
      chainId: effectiveChainId,
      explorerUrl,
      directBadge: 'DIRECT',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();

    logger.info(`Granted access for user ${request.auth.uid} to asset ${assetId} via tx ${txHash}`);

    return {
      success: true,
      assetId,
      txHash,
      verifiedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error('verifyPurchaseAndGrantAccess failed:', error);
    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', `VERIFY_PURCHASE_ERROR: ${error.message}`);
  }
});

// CONFIRM UPLOAD: Store content hash after successful direct upload
exports.confirmIPFSUpload = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new Error('Authentication required');
    }

    const { ipfsHash, contentHash, fileName, fileSize, metadata } = request.data;
    
    if (!ipfsHash || !contentHash) {
      throw new Error('Missing required fields: ipfsHash, contentHash');
    }

    logger.info(`Confirming IPFS upload: ${ipfsHash} for user: ${request.auth.uid}`);

    // Store content hash mapping for future duplicate detection
    const contentAddressing = new ContentAddressing();
    await contentAddressing.storeContentHash(contentHash, ipfsHash, {
      uploadedBy: request.auth.uid,
      fileName,
      fileSize,
      ...metadata
    });

    logger.info(`Content hash stored: ${contentHash} -> ${ipfsHash}`);

    return {
      success: true,
      ipfsHash,
      contentHash,
      storedAt: new Date().toISOString()
    };

  } catch (error) {
    logger.error('Upload confirmation failed:', error);
    throw new Error(`UPLOAD_CONFIRM_ERROR: ${error.message}`, { cause: error });
  }
});
