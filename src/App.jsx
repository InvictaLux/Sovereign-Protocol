import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDocs, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Zap, 
  ShieldCheck, 
  Play, 
  X, 
  Loader2, 
  Lock, 
  ShoppingBag, 
  Database
} from 'lucide-react';

// --- CONFIGURATION ---
const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config
  ? (() => {
      try {
        const parsed = JSON.parse(__firebase_config);
        return parsed && typeof parsed === 'object' ? parsed : { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" };
      } catch (e) {
        console.error('Invalid firebase config:', e);
        return { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" };
      }
    })()
  : { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' && __app_id ? __app_id : 'sovereign-exchange-v1';

// --- DATABASE SEEDER ---
const runGenesisSeed = async () => {
  try {
    // Corrected path to ensure odd number of segments for collection reference
    const marketRef = collection(db, 'artifacts', appId, 'public', 'data', 'marketplace_items');
    const snapshot = await getDocs(marketRef);

    if (snapshot.empty) {
      const genesisItems = [
        {
          title: "Synthetic Dreams",
          artist_name: "The Sovereign",
          price_current: 1.25,
          thumbnail_url: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=800",
          media_type: "audio"
        },
        {
          title: "Neon Citadel",
          artist_name: "Binary Pulse",
          price_current: 3.50,
          thumbnail_url: "https://images.unsplash.com/photo-1514525253344-f814d074e015?auto=format&fit=crop&q=80&w=800",
          media_type: "video"
        },
        {
          title: "Cold Storage",
          artist_name: "Zero Day",
          price_current: 0.75,
          thumbnail_url: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&q=80&w=800",
          media_type: "audio"
        }
      ];

      for (const item of genesisItems) {
        const newRef = doc(marketRef);
        await setDoc(newRef, { ...item, id: newRef.id, createdAt: serverTimestamp() });
      }
    }
  } catch (err) {
    console.error("Seeding failed:", err);
  }
};

export default function App() {
  const [view, setView] = useState('market'); // 'market' | 'vault'
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
        await runGenesisSeed();
      }
      setIsLoading(false);
    });
    
    signInAnonymously(auth).catch(e => console.error("Protocol Error:", e));
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
        <Zap className="text-indigo-500 animate-pulse mb-6" size={56} />
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
            <div className="p-2.5 bg-indigo-600 rounded-2xl group-hover:rotate-12 transition-all shadow-[0_0_30px_rgba(79,70,229,0.3)]">
              <Database size={20} fill="currentColor" />
            </div>
            <span className="font-black tracking-tighter text-2xl uppercase italic leading-none">Sovereign</span>
          </div>
          
          <nav className="flex gap-10">
            <button onClick={() => setView('market')} className={`text-[11px] font-black uppercase tracking-[0.25em] flex items-center gap-2 transition ${view === 'market' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}>
              <ShoppingBag size={14} /> Exchange
            </button>
            <button onClick={() => setView('vault')} className={`text-[11px] font-black uppercase tracking-[0.25em] flex items-center gap-2 transition ${view === 'vault' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}>
              <Lock size={14} /> Vault
            </button>
          </nav>
        </div>
      </header>

      {/* Viewport */}
      <main className="max-w-6xl mx-auto px-6 pt-32 pb-40">
        {view === 'market' ? (
          <section className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <div className="mb-16">
              <h1 className="text-6xl font-black tracking-tighter italic uppercase mb-4">The Exchange</h1>
              <p className="text-zinc-500 max-w-lg font-medium">Verified digital property deeds secured on the Sovereign Protocol.</p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-12">
              {marketItems.map(item => (
                <div key={item.id} onClick={() => setSelectedAsset(item)} className="group cursor-pointer">
                  <div className="aspect-square rounded-[3.5rem] overflow-hidden bg-zinc-900 border border-white/5 relative mb-6 shadow-2xl transition-all duration-700 group-hover:border-indigo-500/50 group-hover:-translate-y-2">
                    <img src={item.thumbnail_url} className="w-full h-full object-cover group-hover:scale-110 transition duration-1000 grayscale-[0.5] group-hover:grayscale-0" alt="" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <div className="absolute bottom-6 right-6 px-4 py-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl text-[10px] font-black tracking-widest">
                      ${typeof item.price_current === 'number' ? item.price_current.toFixed(2) : '0.00'}
                    </div>
                    
                    {userVault.includes(item.id) && (
                      <div className="absolute top-6 left-6 p-3 bg-indigo-500 rounded-2xl shadow-xl animate-in zoom-in duration-300">
                        <ShieldCheck size={20} />
                      </div>
                    )}
                  </div>
                  <h3 className="font-bold text-2xl px-2 mb-1">{item.title}</h3>
                  <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.3em] px-2 italic">{item.artist_name}</p>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <div className="mb-16">
              <h1 className="text-6xl font-black tracking-tighter italic uppercase mb-4">Secure Vault</h1>
              <p className="text-zinc-500 max-w-lg font-medium">Digital deeds verified and locked to your private node.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {userVault.length === 0 ? (
                <div className="col-span-full py-48 text-center border-2 border-dashed border-white/5 rounded-[4rem]">
                  <Lock className="mx-auto text-zinc-900 mb-6" size={64} />
                  <p className="text-zinc-700 font-black tracking-[0.4em] uppercase text-xs">No Assets Verified in Node</p>
                </div>
              ) : (
                marketItems.filter(i => userVault.includes(i.id)).map(item => (
                  <div key={item.id} className="bg-zinc-900/30 p-8 rounded-[3.5rem] border border-white/5 flex items-center justify-between group hover:bg-zinc-900/50 transition-all duration-500">
                    <div className="flex items-center gap-8">
                      <img src={item.thumbnail_url} className="w-28 h-28 rounded-3xl object-cover shadow-2xl grayscale group-hover:grayscale-0 transition-all duration-1000" alt="" />
                      <div>
                        <h4 className="font-bold text-3xl mb-2 tracking-tight">{item.title}</h4>
                        <div className="flex items-center gap-2 text-indigo-400">
                          <ShieldCheck size={16} />
                          <p className="text-[11px] font-black uppercase tracking-widest italic">Verified Asset</p>
                        </div>
                      </div>
                    </div>
                    <button className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 active:scale-90 transition shadow-2xl">
                      <Play size={28} fill="currentColor" className="ml-1" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
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
              <Zap size={24} className="text-indigo-400 animate-pulse" />
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