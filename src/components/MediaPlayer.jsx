import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Zap, ChevronDown, Download, Minimize2, Maximize2 } from 'lucide-react';
import { getSessionAuthSig } from '../services/litSession';

const CHUNK_LENGTH_HEADER_BYTES = 4;
const CHUNK_IV_BYTES = 12;

const uint8ToBase64 = (bytes) => {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const getMimeType = (item) => {
  if (item.fileType) return item.fileType;
  if (item.media_type === 'video') return 'video/mp4';
  if (item.media_type === 'audio') return 'audio/mpeg';
  return 'application/octet-stream';
};

const waitForSourceBuffer = (sourceBuffer, chunk) => new Promise((resolve, reject) => {
  const onUpdateEnd = () => {
    sourceBuffer.removeEventListener('error', onError);
    resolve();
  };

  const onError = () => {
    sourceBuffer.removeEventListener('updateend', onUpdateEnd);
    reject(new Error('Loading segment failed.'));
  };

  sourceBuffer.addEventListener('updateend', onUpdateEnd, { once: true });
  sourceBuffer.addEventListener('error', onError, { once: true });
  sourceBuffer.appendBuffer(chunk);
});

const concatBytes = (a, b) => {
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
};

const createDecryptTransform = (symmetricKey) => {
  let carry = new Uint8Array(0);

  return new TransformStream({
    async transform(chunk, controller) {
      const encryptedChunk = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      carry = concatBytes(carry, encryptedChunk);

      while (carry.byteLength >= CHUNK_LENGTH_HEADER_BYTES + CHUNK_IV_BYTES) {
        const frameView = new DataView(carry.buffer, carry.byteOffset, carry.byteLength);
        const cipherLength = frameView.getUint32(0, false);
        const headerSize = CHUNK_LENGTH_HEADER_BYTES + CHUNK_IV_BYTES;
        const totalSize = headerSize + cipherLength;

        if (carry.byteLength < totalSize) break;

        const iv = carry.slice(CHUNK_LENGTH_HEADER_BYTES, headerSize);
        const cipher = carry.slice(headerSize, totalSize);
        const plainBuffer = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          symmetricKey,
          cipher
        );

        controller.enqueue(new Uint8Array(plainBuffer));
        carry = carry.slice(totalSize);
      }
    },
    flush() {
      if (carry.byteLength > 0) {
        throw new Error('Secure stream incomplete at end.');
      }
    }
  });
};

export default function MediaPlayer({ item, onClose }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState('Authenticating Access');
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [backupStatus, setBackupStatus] = useState('');
  const [backupToast, setBackupToast] = useState('');
  const [isMiniPlayer, setIsMiniPlayer] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const mediaRef = useRef(null);
  const touchStartYRef = useRef(0);

  const resolveSymmetricKey = useCallback(async () => {
    if (!window.ethereum) {
      throw new Error('Wallet is required to unlock this media.');
    }

    const provider = window.ethereum;
    const { authSig, walletAddress, fromCache } = await getSessionAuthSig(provider);

    const litModuleName = '@lit-protocol/lit-node-client';
    const litModule = await import(/* @vite-ignore */ litModuleName);
    const LitNodeClient = litModule?.LitNodeClient;

    if (!LitNodeClient) {
      throw new Error('Secure playback module unavailable in this browser.');
    }

    const litClient = new LitNodeClient({ alertWhenUnauthorized: false, debug: false });
    await litClient.connect();

    setStatus(fromCache ? 'Session Restored' : 'Authenticating Access');

    const encryptedKeySource = item.encryptionKey;
    if (!encryptedKeySource) {
      throw new Error('Missing secure key metadata for this asset.');
    }

    const encryptedSymmetricKey = encryptedKeySource instanceof Uint8Array
      ? encryptedKeySource
      : typeof encryptedKeySource === 'string'
        ? Uint8Array.from(atob(encryptedKeySource), (c) => c.charCodeAt(0))
        : new Uint8Array(encryptedKeySource);

    const accessControlConditions =
      item.accessControlConditions ||
      item.access_control_conditions ||
      [
        {
          chain: 'ethereum',
          contractAddress: '',
          standardContractType: '',
          method: '',
          parameters: [],
          returnValueTest: {
            comparator: '=',
            value: walletAddress
          }
        }
      ];

    const symmetricKey = await litClient.getEncryptionKey({
      unifiedAccessControlConditions: accessControlConditions,
      toDecrypt: uint8ToBase64(encryptedSymmetricKey),
      chain: 'ethereum',
      authSig
    });

    return symmetricKey;
  }, [item.accessControlConditions, item.access_control_conditions, item.encryptionKey]);

  const runBackup = async () => {
    if (!item?.ipfsHash || isBackingUp) return;

    setIsBackingUp(true);
    setBackupProgress(0);
    setBackupStatus('Preparing Backup...');
    setError(null);

    try {
      setBackupStatus('Authenticating Backup Access...');
      const symmetricKey = await resolveSymmetricKey();

      let attempt = 0;
      let complete = false;

      while (!complete && attempt < 2) {
        attempt += 1;
        try {
          setBackupStatus(attempt === 1 ? 'Securing Backup...' : 'Network Interrupted. Resuming Backup...');
          const response = await fetch(`https://gateway.pinata.cloud/ipfs/${item.ipfsHash}`);
          if (!response.ok || !response.body) {
            throw new Error(`Unable to load secure stream (${response.status}).`);
          }

          const contentLengthHeader = response.headers.get('content-length');
          const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : 0;
          let receivedBytes = 0;
          const encryptedReader = response.body.getReader();

          const encryptedStream = new ReadableStream({
            async pull(controller) {
              const { done, value } = await encryptedReader.read();
              if (done) {
                controller.close();
                return;
              }

              const asBytes = value instanceof Uint8Array ? value : new Uint8Array(value);
              receivedBytes += asBytes.byteLength;
              if (totalBytes > 0) {
                setBackupProgress(Math.min(95, Math.round((receivedBytes / totalBytes) * 100)));
              }
              controller.enqueue(asBytes);
            }
          });

          const decryptedStream = encryptedStream.pipeThrough(createDecryptTransform(symmetricKey));
          const decryptedReader = decryptedStream.getReader();
          const decryptedChunks = [];

          while (true) {
            const { done, value } = await decryptedReader.read();
            if (done) break;
            decryptedChunks.push(value);
          }

          if (!decryptedChunks.length) {
            throw new Error('No playable media received.');
          }

          const extension = item.fileName?.split('.').pop() || getMimeType(item).split('/').pop() || 'bin';
          const baseName = (item.title || 'Master_File').replace(/[^a-zA-Z0-9_-]/g, '_');
          const outputName = `${baseName}_Master.${extension}`;
          const blob = new Blob(decryptedChunks, { type: getMimeType(item) });
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = outputName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(downloadUrl);

          setBackupProgress(100);
          setBackupStatus('Backup Complete');
          setBackupToast('Backup Complete. You now hold the master file.');
          setTimeout(() => setBackupToast(''), 5000);
          complete = true;
        } catch (attemptError) {
          if (attempt >= 2) {
            throw attemptError;
          }
        }
      }
    } catch {
      setBackupStatus('Network Interrupted. Resuming Backup...');
      setError('Network Interrupted. Resuming Backup...');
    } finally {
      setIsBackingUp(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    const startPlayback = async () => {
      try {
        setError(null);
        setStatus('Authenticating Access');
        const symmetricKey = await resolveSymmetricKey();

        if (!item.ipfsHash) {
          throw new Error('Missing IPFS hash for media stream.');
        }

        setStatus('Preparing Stream');

        const response = await fetch(`https://gateway.pinata.cloud/ipfs/${item.ipfsHash}`);
        if (!response.ok || !response.body) {
          throw new Error(`Unable to load secure stream (${response.status}).`);
        }

        const reader = response.body.getReader();
        const mimeType = getMimeType(item);
        const canProgressivePlay =
          typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mimeType);

        const decryptedChunks = [];
        let carry = new Uint8Array(0);

        const decodeFrame = async (payload) => {
          const frameView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
          const cipherLength = frameView.getUint32(0, false);
          const headerSize = CHUNK_LENGTH_HEADER_BYTES + CHUNK_IV_BYTES;
          const totalSize = headerSize + cipherLength;

          if (payload.byteLength < totalSize) {
            return null;
          }

          const iv = payload.slice(CHUNK_LENGTH_HEADER_BYTES, headerSize);
          const cipher = payload.slice(headerSize, totalSize);
          const plainBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            symmetricKey,
            cipher
          );

          return {
            plain: new Uint8Array(plainBuffer),
            consumed: totalSize
          };
        };

        let firstPlayableChunkReady = false;
        let mediaSource;
        let sourceBuffer;

        if (canProgressivePlay) {
          mediaSource = new MediaSource();
          objectUrl = URL.createObjectURL(mediaSource);
          setMediaUrl(objectUrl);

          await new Promise((resolve) => {
            mediaSource.addEventListener('sourceopen', resolve, { once: true });
          });

          sourceBuffer = mediaSource.addSourceBuffer(mimeType);
          sourceBuffer.mode = 'sequence';
          setStatus('Preparing Stream');
        }

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;

          carry = concatBytes(carry, value);

          while (!cancelled && carry.byteLength >= CHUNK_LENGTH_HEADER_BYTES + CHUNK_IV_BYTES) {
            const decoded = await decodeFrame(carry);
            if (!decoded) break;

            if (canProgressivePlay && sourceBuffer) {
              await waitForSourceBuffer(sourceBuffer, decoded.plain);
            } else {
              decryptedChunks.push(decoded.plain);
            }

            carry = carry.slice(decoded.consumed);

            if (!firstPlayableChunkReady) {
              firstPlayableChunkReady = true;
              setStatus('Starting Playback');
              if (!cancelled) {
                setIsReady(true);
                setIsPlaying(true);
              }
            }
          }
        }

        if (canProgressivePlay && mediaSource) {
          if (sourceBuffer?.updating) {
            await new Promise((resolve) => {
              sourceBuffer.addEventListener('updateend', resolve, { once: true });
            });
          }

          if (mediaSource.readyState === 'open') {
            mediaSource.endOfStream();
          }

          if (!firstPlayableChunkReady) {
            throw new Error('No playable media received.');
          }

          if (!cancelled) {
            setStatus('Playing');
          }
          return;
        }

        if (!decryptedChunks.length) {
          throw new Error('No playable media received.');
        }

        const decryptedBlob = new Blob(decryptedChunks, { type: mimeType });
        objectUrl = URL.createObjectURL(decryptedBlob);

        if (!cancelled) {
          setMediaUrl(objectUrl);
          setIsReady(true);
          setIsPlaying(true);
          setStatus('Playing');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Playback failed');
          setStatus('Access Failed');
        }
      }
    };

    startPlayback();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [item, resolveSymmetricKey]);

  useEffect(() => {
    if (!mediaRef.current) return;
    if (!isPlaying) {
      mediaRef.current.pause();
      return;
    }

    mediaRef.current.play().catch(() => {
      setIsPlaying(false);
    });
  }, [isPlaying, mediaUrl]);

  useEffect(() => {
    const onResize = () => {
      const nextWidth = window.innerWidth;
      setViewportWidth(nextWidth);
      if (nextWidth >= 640) {
        setIsMiniPlayer(false);
        setDragOffsetY(0);
      }
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const ringRadius = 16;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (backupProgress / 100) * ringCircumference;
  const backupActive = isBackingUp || backupProgress === 100;

  const handleTouchStart = (event) => {
    if (isMiniPlayer) return;
    touchStartYRef.current = event.touches[0]?.clientY || 0;
    setDragOffsetY(0);
  };

  const handleTouchMove = (event) => {
    if (isMiniPlayer) return;
    const moveY = event.touches[0]?.clientY || 0;
    const delta = Math.max(0, moveY - touchStartYRef.current);
    if (delta <= 0) {
      setDragOffsetY(0);
      return;
    }

    const resisted = Math.min(220, Math.pow(delta, 0.92));
    setDragOffsetY(resisted);
  };

  const handleTouchEnd = (event) => {
    if (isMiniPlayer) return;
    const endY = event.changedTouches[0]?.clientY || 0;
    const delta = endY - touchStartYRef.current;
    const miniThreshold = Math.max(72, Math.min(132, viewportWidth * 0.16));

    if (delta > miniThreshold) {
      setIsMiniPlayer(true);
      setDragOffsetY(0);
      return;
    }

    setDragOffsetY(0);
  };

  const miniPlayerBar = isMiniPlayer ? (
    <div className="fixed inset-x-0 bottom-0 z-[160] px-3 pb-3 animate-in slide-in-from-bottom-3 duration-300">
      <div className="bg-zinc-950/95 border border-white/15 backdrop-blur-xl rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl">
        <button onClick={() => setIsMiniPlayer(false)} className="text-zinc-400 hover:text-white transition">
          <Maximize2 size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-bold truncate">{item.title}</p>
          <p className="text-zinc-500 text-[10px] uppercase tracking-[0.2em] truncate">{isBackingUp ? backupStatus : status}</p>
          {backupActive && (
            <p className="text-emerald-300/90 text-[10px] uppercase tracking-[0.18em] mt-0.5 truncate">Securing to Device...</p>
          )}
        </div>

        <button
          onClick={runBackup}
          disabled={isBackingUp}
          className="relative w-10 h-10 rounded-full border border-indigo-400/40 bg-indigo-500/10 text-indigo-200 flex items-center justify-center disabled:opacity-60"
        >
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r={ringRadius} stroke="rgba(255,255,255,0.15)" strokeWidth="2" fill="none" />
            <circle
              cx="18"
              cy="18"
              r={ringRadius}
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeDasharray={ringCircumference}
              strokeDashoffset={isBackingUp || backupProgress === 100 ? ringOffset : ringCircumference}
              className="transition-[stroke-dashoffset] duration-[1800ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            />
          </svg>
          <Download size={16} />
        </button>

        <button
          disabled={!isReady}
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-50"
        >
          {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
        </button>

        <button onClick={onClose} className="text-zinc-500 hover:text-white transition">
          <ChevronDown size={18} />
        </button>
      </div>

      {backupToast && (
        <div className="mt-2 bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 rounded-xl px-4 py-2 text-xs font-medium text-center">
          {backupToast}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
    <div
      className={`fixed inset-0 z-[150] bg-black/95 backdrop-blur-md flex flex-col animate-in slide-in-from-bottom duration-500 transition-transform ${isMiniPlayer ? 'translate-y-[96%] opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}
      style={!isMiniPlayer && dragOffsetY > 0 ? { transform: `translateY(${dragOffsetY}px)` } : undefined}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-center justify-between px-4 py-4 sm:p-8">
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition">
          <ChevronDown size={32} />
        </button>
        <div className="flex items-center gap-2">
          <Zap className="text-indigo-500 fill-current" size={16} />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">{status}</span>
        </div>
        <div className="w-8" />
      </div>

      <div className="sm:hidden px-4 -mt-1 mb-2 flex justify-end">
        <button onClick={() => { setDragOffsetY(0); setIsMiniPlayer(true); }} className="text-zinc-500 hover:text-white transition flex items-center gap-1 text-xs uppercase tracking-[0.2em]">
          <Minimize2 size={14} /> Swipe Down
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start sm:justify-center px-4 sm:px-10 pt-2 sm:pt-0 space-y-6 sm:space-y-12 overflow-y-auto">
        {item.media_type === 'video' ? (
          <video
            ref={mediaRef}
            src={mediaUrl}
            controls
            className="w-full max-w-4xl rounded-[1.25rem] sm:rounded-[2rem] border border-white/10 bg-black shadow-[0_50px_100px_-20px_rgba(79,70,229,0.5)]"
            playsInline
          />
        ) : (
          <div className="w-full max-w-[18rem] sm:max-w-xs aspect-square rounded-[1.75rem] sm:rounded-[3.5rem] overflow-hidden shadow-[0_50px_100px_-20px_rgba(79,70,229,0.5)] border border-white/10">
            <img 
              src={item.thumbnail_url} 
              className={`w-full h-full object-cover transition-transform duration-[10000ms] ${isPlaying ? 'scale-125' : 'scale-100'}`} 
              alt={item.title}
            />
          </div>
        )}

        {item.media_type !== 'video' && (
          <audio ref={mediaRef} src={mediaUrl} controls className="hidden sm:block w-full max-w-xl" />
        )}

        <div className="text-center space-y-2 px-2">
          <h2 className="text-2xl sm:text-4xl font-black tracking-tighter">{item.title}</h2>
          <p className="text-base sm:text-xl text-zinc-500 font-bold tracking-tight">{item.artist_name}</p>
        </div>

        {!isReady && !error && (
          <div className="flex items-center gap-3 text-indigo-300">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <p className="font-mono text-xs uppercase tracking-[0.28em]">Authenticating Access</p>
          </div>
        )}

        {error && (
          <div className="px-4 py-3 border border-red-500/40 rounded-xl bg-red-500/10 text-red-300 text-sm font-mono">
            {error}
          </div>
        )}

        <div className="hidden sm:flex items-center gap-12">
          <button 
            disabled={!isReady}
            onClick={() => setIsPlaying(!isPlaying)} 
            className="w-24 h-24 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPlaying ? (
              <Pause size={40} fill="currentColor" />
            ) : (
              <Play size={40} fill="currentColor" className="ml-2" />
            )}
          </button>

          <button
            onClick={runBackup}
            disabled={isBackingUp}
            className="relative w-20 h-20 border border-indigo-400/40 text-indigo-200 rounded-full flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/20 transition disabled:opacity-50"
          >
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r={ringRadius} stroke="rgba(255,255,255,0.15)" strokeWidth="2" fill="none" />
              <circle
                cx="18"
                cy="18"
                r={ringRadius}
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeDasharray={ringCircumference}
                strokeDashoffset={isBackingUp || backupProgress === 100 ? ringOffset : ringCircumference}
                className="transition-[stroke-dashoffset] duration-[1800ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              />
            </svg>
            <Download size={26} />
          </button>
        </div>

        {backupActive && (
          <p className="text-indigo-300 text-xs font-mono uppercase tracking-[0.22em]">{backupStatus || 'Preparing Backup...'}</p>
        )}

        {backupToast && (
          <div className="px-4 py-3 border border-emerald-400/35 rounded-xl bg-emerald-500/10 text-emerald-200 text-sm font-medium text-center">
            {backupToast}
          </div>
        )}
        
        <div className="w-full max-w-xs h-1 bg-white/10 rounded-full overflow-hidden">
          <div className={`h-full bg-indigo-500 transition-all duration-500 ${isReady ? (isPlaying ? 'w-1/2' : 'w-1/4') : 'w-1/6'} ${!isReady ? 'animate-pulse' : ''}`} />
        </div>
      </div>

      <div className="sm:hidden fixed bottom-0 inset-x-0 bg-zinc-950/95 border-t border-white/10 backdrop-blur-xl rounded-t-[1.5rem] px-5 pt-4 pb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-white font-black text-sm tracking-tight">{item.title}</p>
            <p className="text-zinc-500 text-xs font-mono uppercase tracking-[0.2em]">{isBackingUp ? backupStatus : status}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runBackup}
              disabled={isBackingUp}
              className="relative w-12 h-12 rounded-full border border-indigo-400/40 bg-indigo-500/10 text-indigo-200 flex items-center justify-center disabled:opacity-60"
            >
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r={ringRadius} stroke="rgba(255,255,255,0.15)" strokeWidth="2" fill="none" />
                <circle
                  cx="18"
                  cy="18"
                  r={ringRadius}
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={isBackingUp || backupProgress === 100 ? ringOffset : ringCircumference}
                  className="transition-[stroke-dashoffset] duration-[1800ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                />
              </svg>
              <Download size={16} />
            </button>

            <button
              disabled={!isReady}
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-50"
            >
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
            </button>
          </div>
        </div>

        {item.media_type !== 'video' && (
          <audio ref={mediaRef} src={mediaUrl} controls className="w-full" />
        )}
      </div>

      <div className="p-4 sm:p-12 text-center mb-24 sm:mb-0">
        <p className="text-[9px] text-zinc-600 font-mono uppercase tracking-[0.2em]">
          Media Streamed via IPFS Node • Sovereign Protocol v1.0
        </p>
      </div>
    </div>
    {miniPlayerBar}
    </>
  );
}