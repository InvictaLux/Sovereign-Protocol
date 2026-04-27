import { useState, useEffect, Suspense, lazy } from 'react';
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
  Fingerprint
} from 'lucide-react';
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
  return 'market';
};

const getPathFromView = (nextView) => {
  if (nextView === 'library') return '/library';
  if (nextView === 'studio') return '/studio';
  return '/';
};

export default function App() {
  const [view, setView] = useState(() => getViewFromPath(window.location.pathname));
  const [user, setUser] = useState(null);
  const [marketItems, setMarketItems] = useState([]);
  const [userVault, setUserVault] = useState([]);
  const [libraryItems, setLibraryItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [syncStage, setSyncStage] = useState('BIOMETRIC_AUTH');

  const syncStageLabel = {
    BIOMETRIC_AUTH: 'Confirm Face ID / Fingerprint',
    TX_PENDING: 'Sending Direct Purchase',
    DIRECT_SPLIT_PENDING: 'Splitting Funds Creator 99% / Treasury 1%',
    DIRECT_SPLIT_CONFIRMED: 'Direct Split Confirmed On-Chain',
    VERIFYING_ENTITLEMENT: 'Securing Library Access'
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
    let authTimeoutId;

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
    
    // Clear any existing timeout and set a new one for sign-in
    authTimeoutId = setTimeout(() => {
      if (!auth.currentUser && isMounted) {
        signInAnonymously(auth).catch(e => {
          console.error("Protocol Error:", e);
          // If auth configuration is missing, fallback to Guest Mode
          if (e.code === 'auth/configuration-not-found') {
            console.warn('Falling back to Guest Mode due to Firebase Auth configuration issue');
            setUser({ uid: 'guest-user', isGuest: true });
            setIsLoading(false);
          }
        });
      }
    }, 100);
    
    return () => {
      isMounted = false;
      if (authTimeoutId) clearTimeout(authTimeoutId);
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
          <button className="border border-white/20 px-6 py-2 rounded-none hover:bg-white hover:text-black transition-all font-bold uppercase text-[10px] tracking-[0.2em]">
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
            />
          ) : view === 'library' ? (
            <LibraryView 
              libraryItems={libraryItems}
            />
          ) : (
            <Studio 
              user={user} 
              auth={auth}
            />
          )}
        </Suspense>
      </main>

      {/* Asset Inspection Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="max-w-md w-full bg-[#0a0a0a] rounded-[4.5rem] p-12 border border-white/10 relative shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 p-12">
               <button onClick={() => setSelectedAsset(null)} className="text-zinc-600 hover:text-white transition"><X size={32} /></button>
            </div>
            
            <img src={selectedAsset.thumbnail_url} className="w-full aspect-square rounded-[3.5rem] object-cover mb-12 shadow-2xl border border-white/5" alt="" />
            
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
          </div>
        </div>
      )}

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