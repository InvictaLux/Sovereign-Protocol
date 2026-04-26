import { useState, useEffect, Suspense, lazy } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { 
  Zap, 
  Shield, 
  X, 
  Loader2, 
  ShoppingBag, 
  Database,
  UploadCloud,
  Wallet
} from 'lucide-react';
import { auth, db, appId } from './firebase';
import { seedMarketplace } from './utils/seeder';

// Lazy load components
const MarketView = lazy(() => import('./components/MarketView'));
const VaultView = lazy(() => import('./components/VaultView'));
const Studio = lazy(() => import('./components/Studio'));

export default function App() {
  const [view, setView] = useState('market'); // 'market' | 'vault' | 'studio'
  const [user, setUser] = useState(null);
  const [marketItems, setMarketItems] = useState([]);
  const [userVault, setUserVault] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);

  // Phase 1: Authentication & Seeding
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
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
      setIsLoading(false);
    });
    
    signInAnonymously(auth).catch(e => {
      console.error("Protocol Error:", e);
      // If auth configuration is missing, fallback to mock user for development
      if (e.code === 'auth/configuration-not-found' && import.meta.env.DEV) {
        console.warn('Using mock user for development due to missing Firebase Auth configuration');
        setUser({ uid: 'dev-user-123' });
        setIsLoading(false);
      }
    });
    return () => unsub();
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
      setUserVault(snap.docs.map(d => d.id));
    });

    return () => { unsubMarket(); unsubVault(); };
  }, [user]);

  const acquireAsset = async (asset) => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'library', asset.id);
      await setDoc(docRef, { ...asset, acquiredAt: Date.now(), status: 'verified' });
      setSelectedAsset(null);
      setView('vault');
    } catch (e) {
      console.error('Failed to acquire asset:', e);
      // TODO: Add user notification here
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading || !user) {
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
    <div className="min-h-screen bg-[#020202] text-white selection:bg-indigo-500/40 font-sans">
      {/* Navigation */}
      <header className="fixed top-0 w-full bg-black/40 backdrop-blur-2xl border-b border-white/5 z-50">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setView('market')}>
            <Database size={24} className="text-white group-hover:rotate-12 transition-all" />
            <span className="font-black tracking-tighter text-3xl uppercase italic leading-none text-white">Sovereign</span>
          </div>
          
          <nav className="flex gap-10">
            <button onClick={() => setView('market')} className={`text-[11px] font-black uppercase tracking-[0.25em] flex items-center gap-2 transition ${view === 'market' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}>
              <ShoppingBag size={14} /> Exchange
            </button>
            <button onClick={() => setView('vault')} className={`text-[11px] font-black uppercase tracking-[0.25em] flex items-center gap-2 transition ${view === 'vault' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}>
              <Shield size={14} /> Vault
            </button>
            <button onClick={() => setView('studio')} className={`text-[11px] font-black uppercase tracking-[0.25em] flex items-center gap-2 transition ${view === 'studio' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}>
              <UploadCloud size={14} /> Studio
            </button>
          </nav>
          <button className="flex items-center gap-2 px-4 py-2 border border-indigo-500 rounded-2xl text-[11px] font-black uppercase tracking-widest text-indigo-400 hover:bg-indigo-500/10 transition-all">
            <Wallet size={14} />
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
          ) : view === 'vault' ? (
            <VaultView 
              userVault={userVault} 
              marketItems={marketItems} 
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
              disabled={userVault.includes(selectedAsset.id)}
              className={`w-full py-7 rounded-[2rem] font-black uppercase text-[12px] tracking-[0.3em] transition-all duration-700 shadow-2xl ${
                userVault.includes(selectedAsset.id) 
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-[1.02] active:scale-95 shadow-indigo-600/30'
              }`}
            >
              {userVault.includes(selectedAsset.id) ? 'Asset Verified' : `Acquire Verified Deed — $${typeof selectedAsset.price_current === 'number' ? selectedAsset.price_current.toFixed(2) : '0.00'}`}
            </button>
          </div>
        </div>
      )}

      {/* Ledger Sync HUD */}
      {isSyncing && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="relative mb-10">
            <Loader2 className="animate-spin text-indigo-500" size={96} strokeWidth={1} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Shield size={24} className="text-indigo-400 animate-pulse" />
            </div>
          </div>
          <p className="text-[14px] font-black uppercase tracking-[0.8em] text-white">Validating Protocol Ledger</p>
          <div className="mt-6 flex gap-3">
             <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
             <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
             <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
          </div>
        </div>
      )}
    </div>
  );
}