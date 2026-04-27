import { useState, useEffect, Suspense, lazy, useMemo } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { 
  Zap, 
  Shield, 
  X, 
  Loader2, 
  ShoppingBag, 
  Database,
  Library,
  PlusSquare,
  Fingerprint,
  Verified,
  Sparkles
} from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { auth, db, appId } from './firebase';
import { seedMarketplace } from './utils/seeder';
import { purchaseAssetOnChain } from './services/sovereignContract';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy load components
const MarketView = lazy(() => import('./components/MarketView'));
const LibraryView = lazy(() => import('./components/LibraryView'));
const Studio = lazy(() => import('./components/Studio'));

const getViewFromPath = (pathname) => {
  if (pathname === '/library') return 'library';
  if (pathname === '/studio') return 'studio';
  if (pathname === '/creator') return 'creator';
  return 'market';
};

const getPathFromView = (nextView) => {
  if (nextView === 'library') return '/library';
  if (nextView === 'studio') return '/studio';
  if (nextView === 'creator') return '/creator';
  return '/';
};

export default function App() {
  const identityWords = ['Forge.', 'Own.', 'Sovereign.'];
  const [view, setView] = useState(() => getViewFromPath(window.location.pathname));
  const [user, setUser] = useState(null);
  const [marketItems, setMarketItems] = useState([]);
  const [userVault, setUserVault] = useState([]);
  const [libraryItems, setLibraryItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [syncStage, setSyncStage] = useState('BIOMETRIC_AUTH');
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [showProtocolStatus, setShowProtocolStatus] = useState(false);
  const [showIdentitySequence, setShowIdentitySequence] = useState(false);
  const [identityWordIndex, setIdentityWordIndex] = useState(0);

  const syncStageLabel = {
    BIOMETRIC_AUTH: 'Confirm Face ID / Fingerprint',
    TX_PENDING: 'Sending Direct Purchase',
    DIRECT_SPLIT_PENDING: 'Splitting Funds Creator 99% / Treasury 1%',
    DIRECT_SPLIT_CONFIRMED: 'Direct Split Confirmed On-Chain',
    VERIFYING_ENTITLEMENT: 'Securing Library Access'
  };

  const creatorItems = useMemo(() => {
    if (!creatorProfile) return [];

    return marketItems.filter((item) => {
      const creatorKey = item.creatorAddress || item.creator_address || item.artist_name;
      return creatorKey === creatorProfile.id || item.artist_name === creatorProfile.name;
    });
  }, [marketItems, creatorProfile]);

  const openCreatorProfile = (creator) => {
    if (!creator) return;
    setCreatorProfile({
      id: creator.id,
      name: creator.name || 'Sovereign Creator',
      avatar: creator.avatar,
      bio: creator.bio || 'Independent creator publishing sovereign, direct-split media releases.'
    });
    navigateToView('creator');
  };

  const runIdentitySequence = async () => {
    setShowIdentitySequence(true);
    setIdentityWordIndex(0);

    for (let index = 0; index < identityWords.length; index += 1) {
      setIdentityWordIndex(index);
      await new Promise((resolve) => setTimeout(resolve, 560));
    }

    await new Promise((resolve) => setTimeout(resolve, 320));
    setShowIdentitySequence(false);
  };

  const startSecureSignIn = async () => {
    try {
      await runIdentitySequence();
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Secure sign-in failed:', error);
      setShowIdentitySequence(false);
    }
  };

  const navigateToView = (nextView) => {
    setView(nextView);
    const nextPath = getPathFromView(nextView);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setView(getViewFromPath(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Phase 1: Authentication & Seeding
  useEffect(() => {
    let isMounted = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;
      
      setUser(user);
      
      if (user) {
        try {
          await seedMarketplace();
        } catch (error) {
          console.error('Seeding failed:', error);
          // Fallback: add mock data if Firebase seeding fails
          if (import.meta.env.DEV) {
            console.warn('Using mock marketplace data for development');
            setMarketItems([
              {
                id: 'mock-item-1',
                title: 'After Hours',
                artist_name: 'The Sovereign',
                price_current: 1.25,
                thumbnail_url: 'https://images.unsplash.com/photo-1514525253361-b83f859b71c0?auto=format&fit=crop&q=80&w=800',
                media_type: 'audio'
              },
              {
                id: 'mock-item-2',
                title: 'Neon Citadel',
                artist_name: 'Binary Pulse',
                price_current: 3.50,
                thumbnail_url: 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=800',
                media_type: 'video'
              },
              {
                id: 'mock-item-3',
                title: 'Cold Storage',
                artist_name: 'Zero Day',
                price_current: 0.75,
                thumbnail_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=800',
                media_type: 'audio'
              }
            ]);
          }
        }
      }
      
      if (isMounted) {
        setIsLoading(false);
      }
    });
    
    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  // Phase 2: Real-time Data Streaming
  useEffect(() => {
    if (!user) return;

    const marketRef = collection(db, 'artifacts', appId, 'public', 'data', 'marketplace_items');
    const unsubMarket = onSnapshot(marketRef, (snap) => {
      setMarketItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const vaultRef = collection(db, 'artifacts', appId, 'users', user.uid, 'library');
    const unsubVault = onSnapshot(vaultRef, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const verifiedItems = docs.filter((entry) =>
        entry.status === 'verified' ||
        entry.verified_entitlement === true ||
        !!entry.onchain?.txHash
      );

      setLibraryItems(verifiedItems);
      setUserVault(verifiedItems.map((entry) => entry.id));
    });

    return () => { unsubMarket(); unsubVault(); };
  }, [user]);

  const acquireAsset = async (asset) => {
    if (!user || !asset || !asset.id) return;
    setIsSyncing(true);
    setSyncStage('BIOMETRIC_AUTH');

    try {
      const purchaseResult = await purchaseAssetOnChain(asset, {
        onStatus: (status) => {
          setSyncStage(status);
        }
      });

      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const verifyPurchaseAndGrantAccess = httpsCallable(functions, 'verifyPurchaseAndGrantAccess');

      setSyncStage('VERIFYING_ENTITLEMENT');

      await verifyPurchaseAndGrantAccess({
        appId,
        assetId: asset.id,
        txHash: purchaseResult.txHash,
        buyerAddress: purchaseResult.buyerAddress,
        chainId: purchaseResult.chainId
      });

      setSelectedAsset(null);
      navigateToView('library');
    } catch (e) {
      console.error('Failed to acquire asset:', e);
      alert(`Failed to acquire asset: ${e.message || 'Unknown error occurred'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020202] flex flex-col items-center justify-center text-white">
        <Zap className="text-indigo-400 animate-pulse mb-6" size={24} />
        <div className="w-48 h-[1px] bg-white/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-indigo-500 animate-progress" style={{ width: '40%' }}></div>
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.6em] text-zinc-600 mt-6 animate-pulse">Syncing Protocol</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#020202] text-white selection:bg-indigo-500/40 font-sans">
      {/* Navigation */}
      <header className="fixed top-0 w-full bg-black/60 backdrop-blur-md border-b border-white/10 z-50">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigateToView('market')}>
            <Database size={24} className="text-white group-hover:rotate-12 transition-all" />
            <span className="text-3xl font-black italic tracking-tighter text-white">Sovereign</span>
          </div>
          
          <nav className="flex gap-10">
            <button onClick={() => navigateToView('market')} className={`flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-widest uppercase text-white/70 hover:text-white transition-all ${view === 'market' ? 'text-white border-b border-indigo-500' : ''}`}>
              <ShoppingBag size={18} /> Exchange
            </button>
            <button onClick={() => navigateToView('library')} className={`flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-widest uppercase text-white/70 hover:text-white transition-all ${view === 'library' ? 'text-white border-b border-indigo-500' : ''}`}>
              <Library size={18} /> Library
            </button>
            <button onClick={() => navigateToView('studio')} className={`flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-widest uppercase text-white/70 hover:text-white transition-all ${view === 'studio' ? 'text-white border-b border-indigo-500' : ''}`}>
              <PlusSquare size={18} /> Studio
            </button>
          </nav>
          <button className="border border-white/20 px-6 py-2 rounded-2xl hover:bg-white hover:text-black transition-all duration-500 shadow-[0_10px_24px_rgba(0,0,0,0.35)] font-bold uppercase text-[10px] tracking-[0.2em]">
            Connect
          </button>
        </div>
      </header>

      {/* Viewport */}
      <main className="max-w-6xl mx-auto px-6 pt-32 pb-40">
        <Suspense fallback={
          <div className="flex items-center justify-center py-48">
            <Loader2 className="animate-spin text-indigo-500" size={48} />
          </div>
        }>
          {view === 'market' ? (
            <MarketView 
              marketItems={marketItems} 
              userVault={userVault} 
              setSelectedAsset={setSelectedAsset}
              onSelectCreator={openCreatorProfile}
              onDirectBuy={(item) => setSelectedAsset(item)}
            />
          ) : view === 'library' ? (
            <LibraryView 
              libraryItems={libraryItems}
            />
          ) : view === 'creator' ? (
            <section className="animate-in fade-in slide-in-from-bottom-6 duration-700">
              <div className="rounded-[2.5rem] overflow-hidden border border-white/10 mb-10">
                <div className="h-56 sm:h-72 relative">
                  <img src={creatorProfile?.avatar || 'https://images.unsplash.com/photo-1514525253361-b83f859b71c0?auto=format&fit=crop&q=80&w=1600'} className="w-full h-full object-cover" alt="creator banner" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                  <div className="absolute bottom-6 left-6">
                    <div className="flex items-center gap-2 text-emerald-300 mb-2"><Verified size={16} /><p className="text-xs uppercase tracking-[0.25em] font-mono">Biometric Verified Creator</p></div>
                    <h2 className="text-4xl sm:text-5xl font-black tracking-tight">{creatorProfile?.name || 'Sovereign Creator'}</h2>
                    <p className="text-zinc-300 mt-2 max-w-2xl text-sm sm:text-base">{creatorProfile?.bio}</p>
                  </div>
                </div>
              </div>

              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-2xl font-black tracking-tight">Sovereign Studio Releases</h3>
                <button onClick={() => navigateToView('market')} className="text-xs uppercase tracking-[0.25em] text-zinc-400 hover:text-white transition">Back to Popular</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
                {creatorItems.map((item) => (
                  <article key={item.id} className="rounded-[2rem] border border-white/10 bg-zinc-900/50 overflow-hidden">
                    <button onClick={() => setSelectedAsset(item)} className="w-full text-left">
                      <div className="aspect-square relative">
                        <img src={item.thumbnail_url || 'https://images.unsplash.com/photo-1514525253361-b83f859b71c0?auto=format&fit=crop&q=80&w=800'} className="w-full h-full object-cover" alt={item.title} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                        <div className="absolute bottom-4 right-4 px-3 py-1 rounded-xl bg-black/70 border border-white/10 text-xs font-black">
                          ${typeof item.price_current === 'number' && item.price_current != null ? item.price_current.toFixed(2) : '0.00'}
                        </div>
                      </div>
                    </button>
                    <div className="p-4">
                      <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">{item.media_type || 'media'}</p>
                      <h4 className="text-xl font-black mt-2">{item.title || 'Untitled Asset'}</h4>
                      <button
                        onClick={() => setSelectedAsset(item)}
                        disabled={userVault.includes(item.id)}
                        className="mt-4 w-full py-2 rounded-xl border border-indigo-400/40 text-indigo-200 text-xs uppercase tracking-[0.22em] hover:bg-indigo-500 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {userVault.includes(item.id) ? 'Owned' : 'Direct Buy'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <Studio 
              user={user} 
              auth={auth}
            />
          )}
        </Suspense>
      </main>

      {!user && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] w-[92%] max-w-lg rounded-[1.6rem] border border-indigo-400/30 bg-[#090909]/95 backdrop-blur-md p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Sparkles size={18} className="text-indigo-300 mt-1" />
            <div>
              <p className="text-white font-semibold">Sign in to Secure Your Rights</p>
              <p className="text-zinc-400 text-sm mt-1">Email, Apple, or Google creates your secure protocol wallet in the background.</p>
            </div>
            <button
              onClick={startSecureSignIn}
              className="ml-auto px-3 py-2 rounded-lg border border-indigo-400/40 text-indigo-200 text-[10px] uppercase tracking-[0.2em] hover:bg-indigo-500 hover:text-white transition"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowProtocolStatus((prev) => !prev)}
        className="fixed right-4 bottom-4 z-[130] h-8 px-2.5 rounded-full border border-emerald-300/30 bg-black/65 backdrop-blur-md text-emerald-200 hover:text-white hover:border-emerald-300/60 transition flex items-center justify-center gap-1"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
        <span className="font-mono text-[11px] leading-none tracking-[0.15em]">S</span>
      </button>

      <AnimatePresence>
        {showProtocolStatus && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed right-4 bottom-16 z-[130] w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-emerald-400/30 bg-black/90 p-4 font-mono text-xs shadow-[0_0_30px_rgba(16,185,129,0.15)]"
          >
            <p className="text-emerald-300 uppercase tracking-[0.22em] mb-3">Protocol Status</p>
            <div className="space-y-2 text-zinc-300">
              <p>IPFS Shard ID: {selectedAsset?.ipfsHash || libraryItems[0]?.ipfsHash || 'N/A'}</p>
              <p>TX Hash: {libraryItems[0]?.onchain?.txHash || selectedAsset?.onchain_tx_hash || 'N/A'}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showIdentitySequence && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] bg-black/95 backdrop-blur-xl flex items-center justify-center"
          >
            <motion.p
              key={identityWords[identityWordIndex]}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 1.02 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              className="text-4xl sm:text-6xl font-black tracking-tight text-white"
            >
              {identityWords[identityWordIndex]}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Asset Inspection Modal */}
      <LayoutGroup>
      <AnimatePresence>
      {selectedAsset && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-6"
        >
          <motion.div layoutId={`asset-card-${selectedAsset.id}`} className="max-w-md w-full bg-[#0a0a0a] rounded-[4.5rem] p-12 border border-white/10 relative shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 p-12">
               <button onClick={() => setSelectedAsset(null)} className="text-zinc-600 hover:text-white transition"><X size={32} /></button>
            </div>
            
            <img src={selectedAsset.thumbnail_url || 'https://images.unsplash.com/photo-1514525253361-b83f859b71c0?auto=format&fit=crop&q=80&w=800'} className="w-full aspect-square rounded-[3.5rem] object-cover mb-12 shadow-2xl border border-white/5" alt="" />
            
            <h2 className="text-5xl font-black mb-2 uppercase tracking-tighter italic leading-none">{selectedAsset.title}</h2>
            <p className="text-zinc-500 uppercase text-[12px] font-black tracking-[0.4em] mb-12 italic">{selectedAsset.artist_name}</p>
            
            <button 
              onClick={() => acquireAsset(selectedAsset)}
              disabled={
                userVault.includes(selectedAsset.id) ||
                selectedAsset.onchain_content_id === undefined ||
                selectedAsset.onchain_content_id === null ||
                selectedAsset.price_wei === undefined ||
                selectedAsset.price_wei === null ||
                !selectedAsset.contract_address
              }
              className={`w-full py-7 rounded-[2rem] font-black uppercase text-[12px] tracking-[0.3em] transition-all duration-700 shadow-2xl ${
                userVault.includes(selectedAsset.id) ||
                selectedAsset.onchain_content_id === undefined ||
                selectedAsset.onchain_content_id === null ||
                selectedAsset.price_wei === undefined ||
                selectedAsset.price_wei === null ||
                !selectedAsset.contract_address
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-[1.02] active:scale-95 shadow-indigo-600/30'
              }`}
            >
              {userVault.includes(selectedAsset.id)
                ? 'Asset Verified'
                : (selectedAsset.onchain_content_id === undefined ||
                  selectedAsset.onchain_content_id === null ||
                  selectedAsset.price_wei === undefined ||
                  selectedAsset.price_wei === null ||
                  !selectedAsset.contract_address)
                  ? 'Pending On-Chain Listing'
                  : `Biometric One-Tap Direct Buy — $${typeof selectedAsset.price_current === 'number' && selectedAsset.price_current != null ? selectedAsset.price_current.toFixed(2) : '0.00'}`}
            </button>

            {!userVault.includes(selectedAsset.id) && (
              <div className="mt-4 p-4 border border-emerald-400/30 bg-emerald-500/10 rounded-2xl">
                <p className="text-emerald-300 text-[10px] uppercase tracking-[0.25em] font-mono mb-2">Absolute Direct Split</p>
                <p className="text-emerald-100 text-sm">Creator receives 99% instantly to wallet. Sovereign treasury receives 1% on-chain.</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      </LayoutGroup>

      {/* Ledger Sync HUD */}
      {isSyncing && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="relative mb-10">
            <Loader2 className="animate-spin text-indigo-500" size={96} strokeWidth={1} />
            <div className="absolute inset-0 flex items-center justify-center">
              {syncStage === 'BIOMETRIC_AUTH' ? (
                <Fingerprint size={24} className="text-indigo-400 animate-pulse" />
              ) : (
                <Shield size={24} className="text-indigo-400 animate-pulse" />
              )}
            </div>
          </div>
          <p className="text-[14px] font-black uppercase tracking-[0.5em] text-white text-center px-6">{syncStageLabel[syncStage] || 'Validating Protocol Ledger'}</p>
          <div className="mt-6 flex gap-3">
             <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
             <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
             <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
          </div>
        </div>
      )}
      </div>
    </ErrorBoundary>
  );
}