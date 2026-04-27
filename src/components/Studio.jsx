import { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileAudio,
  FileVideo,
  FileImage,
  FileText,
  Shield,
  Loader2
} from 'lucide-react';
import { signInAnonymously } from 'firebase/auth';
import { doc, setDoc, onSnapshot, collection, query, orderBy, limit } from 'firebase/firestore';
import { db, appId } from '../firebase';
import { listContentOnChain, parseEthToWei } from '../services/sovereignContract';

const CHUNK_FRAME_IV_LENGTH = 12;
const CHUNK_LENGTH_HEADER_BYTES = 4;
const LOG_LIMIT = 120;

const toHex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

const weiToEthDisplay = (weiValue) => {
  if (!weiValue) return '0.0000';
  try {
    const wei = BigInt(weiValue);
    const whole = wei / 1000000000000000000n;
    const fraction = wei % 1000000000000000000n;
    const padded = fraction.toString().padStart(18, '0').slice(0, 4);
    return `${whole.toString()}.${padded}`;
  } catch {
    return '0.0000';
  }
};

const assertNotAborted = (signal) => {
  if (signal?.aborted) {
    throw new DOMException('Operation aborted by user', 'AbortError');
  }
};

const getChunkIV = (baseIv, index) => {
  const iv = new Uint8Array(baseIv);
  const view = new DataView(iv.buffer);
  view.setUint32(CHUNK_FRAME_IV_LENGTH - 4, index, false);
  return iv;
};

const createMultipartStream = ({ fileName, boundary, payloadStream, signal }) => {
  const encoder = new TextEncoder();
  const safeName = fileName.replace(/\r|\n|"/g, '_');
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;
  const reader = payloadStream.getReader();
  let stage = 'header';

  return new ReadableStream({
    async pull(controller) {
      assertNotAborted(signal);

      if (stage === 'header') {
        controller.enqueue(encoder.encode(header));
        stage = 'payload';
        return;
      }

      if (stage === 'payload') {
        const { done, value } = await reader.read();
        if (!done) {
          controller.enqueue(value);
          return;
        }

        stage = 'footer';
      }

      if (stage === 'footer') {
        controller.enqueue(encoder.encode(footer));
        stage = 'done';
        controller.close();
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    }
  });
};

export default function Studio({ user, auth }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [processingError, setProcessingError] = useState(null);
  const [processingSuccess, setProcessingSuccess] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [walletAddress, setWalletAddress] = useState(null);
  const [walletProvider, setWalletProvider] = useState(null);
  const [terminalLog, setTerminalLog] = useState([]);
  const [listingPriceEth, setListingPriceEth] = useState('0.0100');
  const [uploadedAssetRecord, setUploadedAssetRecord] = useState(null);
  const [isListingOnChain, setIsListingOnChain] = useState(false);
  const [totalOnchainEarningsWei, setTotalOnchainEarningsWei] = useState('0');
  const [recentSales, setRecentSales] = useState([]);
  const fileInputRef = useRef(null);
  const litClientRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    const earningsRef = doc(db, 'artifacts', appId, 'public', 'data', 'creator_earnings', user.uid);
    const unsubEarnings = onSnapshot(earningsRef, (snap) => {
      const payload = snap.exists() ? snap.data() : null;
      setTotalOnchainEarningsWei(payload?.total_onchain_earnings_wei || '0');
    });

    const recentSalesRef = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'creator_earnings', user.uid, 'recent_sales'),
      orderBy('created_at', 'desc'),
      limit(8)
    );

    const unsubSales = onSnapshot(recentSalesRef, (snap) => {
      setRecentSales(snap.docs.map((saleDoc) => ({ id: saleDoc.id, ...saleDoc.data() })));
    });

    return () => {
      unsubEarnings();
      unsubSales();
    };
  }, [user]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const finalizeListing = async () => {
    if (!uploadedAssetRecord) {
      setProcessingError('Upload metadata missing. Process the file before finalizing on-chain listing.');
      return;
    }

    try {
      setIsListingOnChain(true);
      setIsProcessing(true);
      setProcessingError(null);
      setProcessingStage('PREPARING CHAIN LISTING...');
      setProcessingProgress(96);

      const priceWei = parseEthToWei(listingPriceEth);
      const displayPrice = Number.parseFloat(listingPriceEth);

      const listingResult = await listContentOnChain({
        ipfsCid: uploadedAssetRecord.ipfsHash,
        priceWei,
        contractAddress: import.meta.env.VITE_SOVEREIGN_CONTRACT_ADDRESS,
        expectedChainId: import.meta.env.VITE_SOVEREIGN_CHAIN_ID,
        onStatus: (status) => {
          if (status === 'TX_PENDING') {
            setProcessingStage('AWAITING WALLET CONFIRMATION...');
            addTerminalLog('[TX_PENDING]');
          }
          if (status === 'MINTING_RIGHTS') {
            setProcessingStage('MINTING RIGHTS ON-CHAIN...');
            addTerminalLog('[MINTING_RIGHTS]');
          }
          if (status === 'PROCEEDS_LOCKED_TO_WALLET') {
            setProcessingStage('LOCKING PROCEEDS ROUTING...');
            addTerminalLog('[PROCEEDS_LOCKED_TO_WALLET]');
          }
        }
      });

      const marketDocRef = doc(
        db,
        'artifacts',
        appId,
        'public',
        'data',
        'marketplace_items',
        uploadedAssetRecord.assetId
      );

      await setDoc(marketDocRef, {
        onchain_content_id: listingResult.onchainContentId,
        contract_address: listingResult.contractAddress,
        chain_id: listingResult.chainId,
        price_wei: listingResult.priceWei,
        price_current: Number.isFinite(displayPrice) ? displayPrice : 0,
        priceCurrent: Number.isFinite(displayPrice) ? displayPrice : 0,
        onchain_tx_hash: listingResult.txHash,
        listed_at: new Date().toISOString()
      }, { merge: true });

      setUploadedAssetRecord((prev) => ({
        ...(prev || {}),
        listedOnChain: true,
        onchainContentId: listingResult.onchainContentId,
        contractAddress: listingResult.contractAddress,
        txHash: listingResult.txHash,
        priceWei: listingResult.priceWei
      }));

      setProcessingSuccess(true);
      setProcessingProgress(100);
      setProcessingStage('LISTING FINALIZED');
      addTerminalLog(`LISTED_CONTENT_ID_${listingResult.onchainContentId}`);
    } catch (error) {
      console.error('Finalize listing failed:', error);
      setProcessingError(error.message || 'Failed to finalize listing on-chain');
      addTerminalLog(`LISTING_FAIL_${error.message}`);
    } finally {
      setIsListingOnChain(false);
      setIsProcessing(false);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileSelection = (file) => {
    // Validate file type
    const validTypes = [
      'audio/mp3', 'audio/mpeg', 'audio/wav',
      'video/mp4', 'video/quicktime', 'video/webm',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf'
    ];

    const fileExtRegex = new RegExp('\\.(mp3|wav|mp4|mov|webm|jpg|jpeg|png|gif|pdf)$', 'i');
    if (validTypes.includes(file.type) || file.name.match(fileExtRegex)) {
      setSelectedFile(file);
      setProcessingError(null);
      setProcessingSuccess(false);
      setUploadedAssetRecord(null);
      setTerminalLog([]);
    } else {
      alert('Please select a valid file type (MP3, Video, Image, or PDF)');
    }
  };

  const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    if (['mp3', 'wav', 'ogg'].includes(extension)) return <FileAudio size={48} />;
    if (['mp4', 'mov', 'webm'].includes(extension)) return <FileVideo size={48} />;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) return <FileImage size={48} />;
    if (['pdf'].includes(extension)) return <FileText size={48} />;
    return <UploadCloud size={48} />;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const initializeLitClient = async () => {
    try {
      setProcessingStage('INITIALIZING LIT PROTOCOL...');
      if (!litClientRef.current) {
        const litModuleName = '@lit-protocol/lit-node-client';
        const litModule = await import(/* @vite-ignore */ litModuleName);
        const LitNodeClient = litModule?.LitNodeClient;

        if (!LitNodeClient) {
          throw new Error('LitNodeClient export not found in @lit-protocol/lit-node-client');
        }

        litClientRef.current = new LitNodeClient({
          alertWhenUnauthorized: false,
          debug: false,
        });
        await litClientRef.current.connect();
      }
      console.log('Lit Protocol client initialized');
    } catch (error) {
      console.error('Lit Protocol initialization failed:', error);
      throw new Error(
        `LIT_INIT_ERROR: ${error.message}. Ensure @lit-protocol/lit-node-client is installed in frontend dependencies.`,
        { cause: error }
      );
    }
  };

  const addTerminalLog = (message) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const shardId = Math.random().toString(16).slice(2, 10).toUpperCase();
    setTerminalLog((prev) => [...prev, `[${timestamp}] SHARD_${shardId}: ${message}`].slice(-LOG_LIMIT));
  };

  const createEncryptedStreamPipeline = async ({ file, symmetricKey, signal }) => {
    try {
      const baseIv = crypto.getRandomValues(new Uint8Array(CHUNK_FRAME_IV_LENGTH));
      let chunkIndex = 0;
      let encryptedBytes = 0;
      let rollingHash = null;

      let resolveHash;
      const contentHashPromise = new Promise((resolve) => {
        resolveHash = resolve;
      });

      const encryptedStream = file.stream().pipeThrough(new TransformStream({
        async transform(chunk, controller) {
          assertNotAborted(signal);

          const sourceChunk = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
          const chunkIV = getChunkIV(baseIv, chunkIndex);

          const chunkHash = new Uint8Array(await crypto.subtle.digest('SHA-256', sourceChunk));
          if (!rollingHash) {
            rollingHash = chunkHash;
          } else {
            const chained = new Uint8Array(rollingHash.length + chunkHash.length);
            chained.set(rollingHash, 0);
            chained.set(chunkHash, rollingHash.length);
            rollingHash = new Uint8Array(await crypto.subtle.digest('SHA-256', chained));
          }

          const cipherBuffer = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: chunkIV },
            symmetricKey,
            sourceChunk
          );

          const cipherChunk = new Uint8Array(cipherBuffer);
          const frame = new Uint8Array(
            CHUNK_LENGTH_HEADER_BYTES + CHUNK_FRAME_IV_LENGTH + cipherChunk.byteLength
          );

          const frameView = new DataView(frame.buffer);
          frameView.setUint32(0, cipherChunk.byteLength, false);
          frame.set(chunkIV, CHUNK_LENGTH_HEADER_BYTES);
          frame.set(cipherChunk, CHUNK_LENGTH_HEADER_BYTES + CHUNK_FRAME_IV_LENGTH);

          encryptedBytes += sourceChunk.byteLength;
          setProcessingProgress(20 + Math.round((encryptedBytes / file.size) * 50));
          addTerminalLog(`ENC_${toHex(frame.slice(0, 16)).toUpperCase()}`);

          controller.enqueue(frame);
          chunkIndex += 1;
        },
        flush() {
          const finalHash = rollingHash ? toHex(rollingHash) : toHex(new Uint8Array(32));
          addTerminalLog(`HASH_${finalHash.toUpperCase()}`);
          resolveHash(finalHash);
        }
      }), { signal });

      return {
        encryptedStream,
        iv: Array.from(baseIv),
        contentHashPromise
      };
    } catch (error) {
      console.error('File encryption stream failed:', error);
      throw new Error(`ENCRYPTION_ERROR: ${error.message}`, { cause: error });
    }
  };

  const getAccessControlConditions = (signerAddress) => {
    return [
      {
        chain: 'ethereum',
        contractAddress: '',
        standardContractType: '',
        method: '',
        parameters: [],
        returnValueTest: {
          comparator: '=',
          value: signerAddress
        }
      }
    ];
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        throw new Error('MetaMask not installed');
      }

      setProcessingStage('CONNECTING WALLET...');
      
      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      const provider = window.ethereum;
      const [address] = await provider.request({ method: 'eth_accounts' });

      if (!address) {
        throw new Error('No wallet address returned from provider');
      }
      
      setWalletProvider(provider);
      setWalletAddress(address);
      
      console.log('Wallet connected:', address);
      return { provider, address };
    } catch (error) {
      console.error('Wallet connection failed:', error);
      throw new Error(`WALLET_CONNECTION_ERROR: ${error.message}`, { cause: error });
    }
  };

  const encryptSymmetricKey = async (symmetricKey, accessControlConditions) => {
    try {
      setProcessingStage('SHARDING ENCRYPTION KEY...');
      setProcessingProgress(82);

      let provider;
      let address;

      if (!walletProvider) {
        const wallet = await connectWallet();
        provider = wallet.provider;
        address = wallet.address;
      } else {
        provider = walletProvider;
        address = walletAddress || (await provider.request({ method: 'eth_accounts' }))[0];
      }

      if (!address) {
        throw new Error('Wallet address unavailable for Lit auth signature');
      }
      
      const message = 'I am creating a Lit Protocol encrypted file';
      const signature = await provider.request({
        method: 'personal_sign',
        params: [message, address]
      });

      const authSig = {
        sig: signature,
        derivedVia: 'web3.eth.personal.sign',
        signedMessage: message,
        address: address
      };
      
      const encryptedSymmetricKey = await litClientRef.current.saveEncryptionKey({
        unifiedAccessControlConditions: accessControlConditions,
        symmetricKey: new Uint8Array(symmetricKey),
        authSig,
        chain: 'ethereum'
      });
      
      setProcessingProgress(84);
      console.log('Symmetric key encrypted with Lit Protocol:', address);
      
      return encryptedSymmetricKey;
    } catch (error) {
      console.error('Lit Protocol encryption failed:', error);
      throw new Error(`LIT_ENCRYPTION_ERROR: ${error.message}`, { cause: error });
    }
  };

  const cancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsProcessing(false);
      setProcessingError('Upload cancelled by user');
      addTerminalLog('UPLOAD_ABORTED_BY_USER');
      console.log('Upload cancelled');
    }
  };

  const uploadToIPFS = async ({ encryptedStream, fileName, fileSize, contentHashPromise, signal }) => {
    try {
      setProcessingStage('REQUESTING UPLOAD TOKEN...');
      setProcessingProgress(85);
      addTerminalLog('INIT_UPLOAD_HANDSHAKE');
      
      // Get presigned URL from Cloud Function
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const getPresignedURL = httpsCallable(functions, 'getIPFSPresignedURL');

      const presignedResult = await getPresignedURL({
        fileName,
        fileSize
      });

      if (presignedResult.data.skipUpload) {
        setProcessingProgress(100);
        addTerminalLog('CONTENT_DUPLICATE_DETECTED');
        console.log('Content already exists:', presignedResult.data.ipfsHash);
        return presignedResult.data.ipfsHash;
      }

      setProcessingStage('UPLOADING TO IPFS...');
      setProcessingProgress(90);
      addTerminalLog('PIPE_INITIATED');

      const boundary = `----SovereignBoundary${Math.random().toString(16).slice(2, 18)}`;
      const finalStream = createMultipartStream({
        fileName,
        boundary,
        payloadStream: encryptedStream,
        signal
      });

      addTerminalLog('STREAM_PIPE_ESTABLISHED');

      const uploadResponse = await fetch(presignedResult.data.uploadURL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${presignedResult.data.scopedKey}`,
          'X-API-KEY': presignedResult.data.scopedKey,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: finalStream,
        signal
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }

      const uploadResult = await uploadResponse.json();
      const ipfsHash = uploadResult.IpfsHash;
      const contentHash = await contentHashPromise;
      
      setProcessingProgress(95);
      addTerminalLog(`UPLOAD_SUCCESS_${ipfsHash}`);

      const confirmUpload = httpsCallable(functions, 'confirmIPFSUpload');
      await confirmUpload({
        ipfsHash,
        contentHash,
        fileName,
        fileSize,
        metadata: {
          walletAddress: walletAddress
        }
      });

      setProcessingProgress(100);
      addTerminalLog('PROTOCOL_COMPLETE');
      console.log('File uploaded directly to IPFS:', ipfsHash);
      
      return ipfsHash;
    } catch (error) {
      if (error.name === 'AbortError') {
        addTerminalLog('UPLOAD_ABORTED');
        console.log('Upload was aborted');
        throw new Error('Upload cancelled', { cause: error });
      }
      addTerminalLog(`UPLOAD_ERROR_${error.message}`);
      console.error('IPFS upload failed:', error);
      throw new Error(`IPFS_UPLOAD_ERROR: ${error.message}`, { cause: error });
    }
  };

  const storeMetadata = async (metadata) => {
    try {
      setProcessingStage('STORING METADATA...');
      
      const assetId = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'marketplace_items', assetId), {
        ...metadata,
        assetId,
        createdAt: new Date().toISOString(),
        isEncrypted: true
      });
      
      console.log('Metadata stored to Firestore');
      
      return assetId;
    } catch (error) {
      console.error('Firestore write failed:', error);
      throw new Error(`FIRESTORE_ERROR: ${error.message}`, { cause: error });
    }
  };

  const processFile = async () => {
    if (!selectedFile || !user) return;
    
    setIsProcessing(true);
    setProcessingError(null);
    setProcessingSuccess(false);
    setUploadedAssetRecord(null);
    
    try {
      await initializeLitClient();

      const signerAddress = walletAddress || (await connectWallet()).address;
      const accessControlConditions = getAccessControlConditions(signerAddress);

      setProcessingStage('GENERATING SECURE KEY...');
      setProcessingProgress(8);
      const symmetricCryptoKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      const rawSymmetricKey = new Uint8Array(await crypto.subtle.exportKey('raw', symmetricCryptoKey));

      const encryptedSymmetricKey = await encryptSymmetricKey(rawSymmetricKey, accessControlConditions);

      if (!encryptedSymmetricKey) {
        throw new Error('LIT Protocol encryption failed - cannot proceed');
      }

      setProcessingStage('FORGING PERMANENT RIGHTS...');
      addTerminalLog('PIPELINE_ARMED');
      abortControllerRef.current = new AbortController();

      const {
        encryptedStream,
        iv,
        contentHashPromise
      } = await createEncryptedStreamPipeline({
        file: selectedFile,
        symmetricKey: symmetricCryptoKey,
        signal: abortControllerRef.current.signal
      });

      const ipfsHash = await uploadToIPFS({
        encryptedStream,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        contentHashPromise,
        signal: abortControllerRef.current.signal
      });

      const fileNameRegex = /\.[^/.]+$/;
      const mediaType = selectedFile.type.startsWith('audio/') ? 'audio' :
        selectedFile.type.startsWith('video/') ? 'video' :
        selectedFile.type.startsWith('image/') ? 'image' : 'document';

      const metadata = {
        assetId: '',
        creatorAddress: user.uid,
        ipfsHash,
        encryptionKey: encryptedSymmetricKey,
        isEncrypted: true,
        title: selectedFile.name.replace(fileNameRegex, ''),
        artist_name: 'Sovereign Creator',
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type,
        accessControlConditions,
        iv,
        priceCurrent: 0.0,
        price_current: 0.0,
        price_wei: null,
        onchain_content_id: null,
        contract_address: import.meta.env.VITE_SOVEREIGN_CONTRACT_ADDRESS || null,
        chain_id: import.meta.env.VITE_SOVEREIGN_CHAIN_ID || null,
        mediaType,
        media_type: mediaType,
        thumbnail_url: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80&w=800'
      };

      const assetId = await storeMetadata(metadata);

      setUploadedAssetRecord({
        assetId,
        ipfsHash,
        title: metadata.title,
        listedOnChain: false
      });
      
      setProcessingSuccess(true);
      setProcessingProgress(100);
      setProcessingStage('FORGING COMPLETE - READY FOR ON-CHAIN LISTING');

      addTerminalLog(`ASSET_LISTED_${ipfsHash}`);
      console.log('Asset processed successfully:', ipfsHash);
    } catch (error) {
      console.error('Processing failed:', error);
      setProcessingError(error.message);
      addTerminalLog(`FAIL_${error.message}`);
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleSignIn = async () => {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  if (!user) {
    return (
      <section className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <div className="mb-16">
          <h1 className="text-3xl font-black italic tracking-tighter text-white leading-none mb-4">Creator Studio</h1>
          <p className="text-zinc-500 max-w-lg font-medium font-mono text-sm">Sign in to access the creator studio and upload your digital assets.</p>
        </div>
        
        <div className="max-w-md mx-auto bg-zinc-900/50 p-12 rounded-[3.5rem] border border-white/5 text-center">
          <UploadCloud size={64} className="mx-auto text-indigo-400 mb-6" />
          <p className="text-zinc-400 mb-8">Authentication required to access creator tools</p>
          <button
            onClick={handleSignIn}
            className="w-full py-4 border border-white/10 text-white font-mono text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-all"
          >
            Sign In Anonymously
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <div className="mb-16">
        <h1 className="text-3xl font-black italic tracking-tighter text-white leading-none mb-4">Creator Studio</h1>
        <p className="text-zinc-500 max-w-lg font-medium font-mono text-sm">Upload and manage your digital assets on the Sovereign Protocol.</p>
      </div>

      <div className="max-w-4xl mx-auto mb-8 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6">
        <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-[2rem] p-6">
          <p className="text-emerald-300 text-[10px] uppercase tracking-[0.3em] font-mono mb-2">Earnings Secured to Wallet</p>
          <h2 className="text-4xl font-black tracking-tight text-emerald-100">{weiToEthDisplay(totalOnchainEarningsWei)} ETH</h2>
          <p className="mt-3 text-sm text-emerald-200/80">Absolute Direct split: creator receives 99% instantly per sale.</p>
        </div>

        <div className="bg-zinc-900/50 border border-white/10 rounded-[2rem] p-6">
          <p className="text-zinc-300 text-[10px] uppercase tracking-[0.3em] font-mono mb-3">Recent Sales</p>
          {recentSales.length === 0 ? (
            <p className="text-zinc-500 text-sm">No direct receipts yet.</p>
          ) : (
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between gap-3 bg-black/40 border border-white/5 rounded-xl p-3">
                  <div>
                    <p className="text-white text-sm font-semibold leading-tight">{sale.title || 'Untitled Asset'}</p>
                    <p className="text-zinc-500 text-xs font-mono">+{weiToEthDisplay(sale.creatorShareWei)} ETH</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black tracking-widest">DIRECT</span>
                    <a
                      href={sale.explorerUrl || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="block mt-2 text-xs text-indigo-300 hover:text-indigo-200"
                    >
                      View Receipt
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        {/* Upload Zone */}
        <div
          className={
            "relative border-2 border-dashed rounded-[3.5rem] p-16 text-center transition-all duration-300 " +
            (isDragging 
              ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]' 
              : 'border-white/10 bg-zinc-900/30 hover:border-white/20 hover:bg-zinc-900/50')
          }
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".mp3,.wav,.mp4,.mov,.webm,.jpg,.jpeg,.png,.gif,.pdf,audio/*,video/*,image/*,.pdf"
            onChange={handleFileInput}
          />
          
          <div className="pointer-events-none">
            <UploadCloud 
              size={96} 
              className={"mx-auto mb-8 transition-colors duration-300 " +
                (isDragging ? 'text-indigo-400' : 'text-zinc-600')
              } 
            />
            
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-white">
                {isDragging ? 'Drop file here' : 'Drag & Drop your files'}
              </h3>
              <p className="text-zinc-500">
                or click to browse from your device
              </p>
              <div className="flex flex-wrap justify-center gap-4 text-xs text-zinc-600">
                <span className="px-3 py-1 bg-zinc-800 rounded-full">MP3</span>
                <span className="px-3 py-1 bg-zinc-800 rounded-full">Video</span>
                <span className="px-3 py-1 bg-zinc-800 rounded-full">Images</span>
                <span className="px-3 py-1 bg-zinc-800 rounded-full">PDF</span>
              </div>
            </div>
          </div>
        </div>

        {/* Selected File Preview & Processing */}
        {selectedFile && (
          <div className="mt-8 bg-zinc-900/30 p-8 rounded-[3.5rem] border border-white/5">
            {!isProcessing ? (
              <div className="space-y-6">
                <div className="flex items-center gap-6">
                  <div className="p-4 bg-indigo-500/20 rounded-2xl text-indigo-400">
                    {getFileIcon(selectedFile.name)}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xl font-bold text-white mb-2">{selectedFile.name}</h4>
                    <p className="text-zinc-500">{formatFileSize(selectedFile.size)}</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setProcessingError(null);
                      setProcessingSuccess(false);
                      setUploadedAssetRecord(null);
                      setTerminalLog([]);
                    }}
                    className="px-6 py-3 bg-red-500/20 text-red-400 rounded-2xl hover:bg-red-500/30 transition-colors"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-4 text-left">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-2 font-mono">Listing Price (ETH)</p>
                    <input
                      type="text"
                      value={listingPriceEth}
                      onChange={(e) => setListingPriceEth(e.target.value)}
                      placeholder="0.0100"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="bg-indigo-500/10 border border-indigo-400/30 rounded-2xl p-4 text-left">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-indigo-300 mb-2 font-mono">Fee Transparency</p>
                    <p className="text-sm text-indigo-100 font-mono">You receive 99%. Sovereign Protocol receives 1%.</p>
                  </div>
                </div>

                {terminalLog.length > 0 && (
                  <div className="mt-4 p-3 bg-black/80 border border-green-500/30 rounded-lg font-mono text-xs">
                    <div className="text-green-400 mb-2 uppercase tracking-wider">PROTOCOL LOG:</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {terminalLog.map((log, index) => (
                        <div key={index} className="text-green-300 opacity-80">
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={processFile}
                    disabled={isProcessing || isListingOnChain || !selectedFile}
                    className="flex-1 py-4 border border-white/10 text-white font-mono text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Process with Sovereign Protocol
                  </button>

                  <button
                    onClick={finalizeListing}
                    disabled={!uploadedAssetRecord || isListingOnChain}
                    className="flex-1 py-4 border border-indigo-500/40 text-indigo-300 font-mono text-xs uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isListingOnChain ? 'Finalizing...' : 'Finalize Listing'}
                  </button>
                </div>

                {processingError && (
                  <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400">
                    <p className="font-mono text-sm">{processingError}</p>
                  </div>
                )}

                {processingSuccess && uploadedAssetRecord?.listedOnChain && (
                  <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-xl text-green-400">
                    <p className="font-mono text-sm">Live on-chain. Content ID #{uploadedAssetRecord.onchainContentId}</p>
                  </div>
                )}

                {processingSuccess && !uploadedAssetRecord?.listedOnChain && (
                  <div className="p-4 bg-yellow-500/20 border border-yellow-500/40 rounded-xl text-yellow-300">
                    <p className="font-mono text-sm">Upload complete. Click Finalize Listing to mint rights on-chain.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Processing Status */}
                <div className="text-center space-y-4">
                  <div className="relative inline-flex">
                    <Loader2 className="animate-spin text-indigo-500" size={48} strokeWidth={1} />
                    <Shield className="absolute inset-0 m-auto text-indigo-400 animate-pulse" size={20} />
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-lg font-black uppercase tracking-wider text-white font-mono">{processingStage}</h3>
                    <div className="text-indigo-400 font-mono text-xs">{processingProgress}%</div>
                    <div className="flex justify-center gap-2">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                    </div>
                  </div>
                </div>
                
                {/* Progress Bar with Industrial Flicker Effect */}
                <div className="space-y-2">
                  <div className="w-full bg-zinc-800/50 rounded-full h-2 overflow-hidden">
                    <div 
                      className={"h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 " +
                        ((processingStage.includes('ENCRYPTING') || processingStage.includes('UPLOADING')) 
                          ? 'animate-pulse' 
                          : '')
                      }
                      style={{ 
                        width: processingProgress + "%",
                        animation: (processingStage.includes('ENCRYPTING') || processingStage.includes('UPLOADING')) 
                          ? 'flicker 0.5s infinite' 
                          : 'none'
                      }}
                    />
                  </div>
                </div>
                
                {isProcessing && terminalLog.length > 0 && (
                  <div className="mt-4 p-3 bg-black/80 border border-green-500/30 rounded-lg font-mono text-xs">
                    <div className="text-green-400 mb-2 uppercase tracking-wider">PROTOCOL LOG:</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {terminalLog.map((log, index) => (
                        <div key={index} className="text-green-300 opacity-80 animate-pulse">
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Action Buttons */}
                <div className="text-center space-y-4">
                  {processingError && (
                    <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400">
                      <p className="font-mono text-sm">{processingError}</p>
                    </div>
                  )}
                  
                  {processingSuccess && (
                    <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-xl text-green-400">
                      <p className="font-mono text-sm">Asset processed successfully!</p>
                    </div>
                  )}
                  
                  <div className="flex gap-4">
                    <button
                      onClick={processFile}
                      disabled={isProcessing || !selectedFile}
                      className="flex-1 py-4 border border-white/10 text-white font-mono text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? 'Processing...' : 'Process with Sovereign Protocol'}
                    </button>
                    
                    {isProcessing && (
                      <button
                        onClick={cancelUpload}
                        className="px-6 py-4 border border-red-500/50 text-red-400 font-mono text-xs uppercase tracking-widest hover:bg-red-500/20 transition-all"
                      >
                        Cancel Upload
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
