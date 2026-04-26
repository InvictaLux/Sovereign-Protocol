import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { 
  Play, Pause, ShoppingBag, Music, ShieldCheck, 
  Zap, Loader2, X, ArrowRight, Library, ChevronDown
} from 'lucide-react';

// --- Firebase Configuration ---
// Note: In a production environment, use import.meta.env
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "",
      authDomain: "",
      projectId: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: ""
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'sovereign-protocol-v1';

// --- Utility: Seeder ---
const seedMarketplace = async () => {
  try {
    const marketRef = collection(db, 'artifacts', appId, 'public', 'data', 'marketplace_items');
    const snapshot = await getDocs(marketRef);

    if (snapshot.empty) {
      const initialItems = [
        {
          title: "After Hours",
          artist_name: "The Sovereign",
          price_current: 1.00,
          thumbnail_url: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=1000",
          media_type: "audio"
        },
        {
          title: "Live at The Citadel",
          artist_name: "Neon Architect",
          price_current: 2.50,
          thumbnail_url: "https://images.unsplash.com/photo-1514525253344-f814d074e015?auto=format&fit=crop&q=80&w=1000",
          media_type: "video"
        },
        {
          title: "Cold Storage",
          artist_name: "Binary Pulse",
          price_current: 0.50,
          thumbnail_url: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?auto=format&fit=crop&q=80&w=1000",
          media_type: "audio"
        }
      ];

      for (const item of initialItems) {
        const newDocRef = doc(marketRef);
        await setDoc(newDocRef, { ...item, id: newDocRef.id, createdAt: serverTimestamp() });
      }
    }
  } catch (error) {
    console.error("Seeding failed:", error);
  }
};

// --- Component: Market ---
function Market({ items, ownedIds, onItemClick }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-8 animate-in fade-in duration-700">
      {items.map((item) => (
        <div 
          key={item.id} 
          onClick={() => onItemClick(item)}
          className="group cursor-pointer"
        >
          <div className="aspect-square rounded-[2.5rem] overflow-hidden bg-zinc-900 border border-white/5 relative mb-4 shadow-xl group-hover:border-indigo-500/50 transition-all duration-500">
            <img 
              src={item.thumbnail_url} 
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-110 transition duration-700" 
            />
            <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl text-[10px] font-black tracking-widest">
              ${item.price_current?.toFixed(2)}
            </div>
            {ownedIds.includes(item.id) && (
              <div className="absolute top-4 left-4 p-2 bg-indigo-500 rounded-2xl shadow-2xl">
                <ShieldCheck size={14} className="text-white" />
              </div>
            )}
          </div>
          <h3 className="font-bold text-sm px-1 truncate">{item.title}</h3>
          <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] px-1 mt-1">
            {item.artist_name}
          </p>
        </div>
      ))}
    </div>
  );
}

// --- Component: MediaPlayer ---
function MediaPlayer({ item, onClose }) {
  const [isPlaying, setIsPlaying] = useState(true);

  return (
    <div className="fixed inset-0 z-[150] bg-black flex flex-col animate-in slide-in-from-bottom duration-500">
      <div className="flex items-center justify-between p-8">
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition">
          <ChevronDown size={32} />
        </button>
        <div className="flex items-center gap-2">
          <Zap className="text-indigo-500 fill-current" size={16} />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Now Decrypting</span>
        </div>
        <div className="w-8" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-10 space-y-12">
        <div className="w-full max-w-xs aspect-square rounded-[3.5rem] overflow-hidden shadow-[0_50px_100px_-20px_rgba(79,70,229,0.5)] border border-white/10">
          <img 
            src={item.thumbnail_url} 
            className={`w-full h-full object-cover transition-transform duration-[10000ms] ${isPlaying ? 'scale-125' : 'scale-100'}`} 
            alt={item.title}
          />
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-4xl font-black tracking-tighter">{item.title}</h2>
          <p className="text-xl text-zinc-500 font-bold tracking-tight">{item.artist_name}</p>
        </div>

        <div className="flex items-center gap-12">
          <button 
            onClick={() => setIsPlaying(!isPlaying)} 
            className="w-24 h-24 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xl"
          >
            {isPlaying ? (
              <Pause size={40} fill="currentColor" />
            ) : (
              <Play size={40} fill="currentColor" className="ml-2" />
            )}
          </button>
        </div>
        
        <div className="w-full max-w-xs h-1 bg-white/10 rounded-full overflow-hidden">
          <div className={`h-full bg-indigo-500 transition-all duration-500 ${isPlaying ? 'w-1/3' : 'w-0'}`} />
        </div>
      </div>
      
      <div className="p-12 text-center text-zinc-700">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em]">
          Media Streamed via IPFS Node • Sovereign Protocol v1.0
        </p>
      </div>
    </div>
  );
}

// --- Main Application ---
export default function App() {
  const [view, setView] = useState('market');
  const [user, setUser] = useState(null);
  const [marketItems, setMarketItems] = useState([]);
  const [myLibrary, setMyLibrary] = useState([]);
  const [activeMedia, setActiveMedia] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 1. Auth & Seeding Initialization
  useEffect(() => {
    const init = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error", err);
      }
    };
    init();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) seedMarketplace();
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Data Listeners
  useEffect(() => {
    if (!user) return;

    const marketRef = collection(db, 'artifacts', appId, 'public', 'data', 'marketplace_items');
    const unsubMarket = onSnapshot(marketRef, (snap) => {
      setMarketItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Market listener error", err));

    const libraryRef = collection(db, 'artifacts', appId, 'users', user.uid, 'library');
    const unsubLib = onSnapshot(libraryRef, (snap) => {
      setMyLibrary(snap.docs.map(d => d.id));
    }, (err) => console.error("Library listener error", err));

    return () => { unsubMarket(); unsubLib(); };
  }, [user]);

  const handlePurchase = async (item) => {
    if (!user) return;
    setIsProcessing(true);
    try {
      await new Promise(r => setTimeout(r, 1200));
      const userLibRef = doc(db, 'artifacts', appId, 'users', user.uid, 'library', item.id);
      await setDoc(userLibRef, { ...item, purchasedAt: Date.now() });
      setPreviewItem(null);
      setView('library');
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!user) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader2 className="text-indigo-500 animate-spin" size={32} />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-indigo-500/30">
      <header className="fixed top-0 w-full bg-black/60 backdrop-blur-xl border-b border-white/5 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('market')}>
            <Zap className="text-indigo-500 fill-current" size={24} />
            <span className="font-black tracking-tighter text-xl uppercase italic">Sovereign</span>
          </div>
          <div className="flex gap-8">
            <button 
              onClick={() => setView('market')} 
              className={`text-[10px] font-black uppercase tracking-[0.2em] transition ${view === 'market' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              Market
            </button>
            <button 
              onClick={() => setView('library')} 
              className={`text-[10px] font-black uppercase tracking-[0.2em] transition ${view === 'library' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              Vault
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-24 pb-32">
        {view === 'market' ? (
          <Market 
            items={marketItems} 
            ownedIds={myLibrary} 
            onItemClick={setPreviewItem} 
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {myLibrary.length === 0 ? (
              <div className="col-span-full py-32 text-center">
                <div className="inline-flex p-6 rounded-full bg-zinc-900 mb-6 border border-white/5">
                  <Library className="text-zinc-700" size={32} />
                </div>
                <p className="text-sm text-zinc-600 font-medium italic">Your encrypted vault is empty.</p>
              </div>
            ) : (
              marketItems.filter(i => myLibrary.includes(i.id)).map(item => (
                <div key={item.id} className="bg-zinc-900/40 p-4 rounded-[2.5rem] border border-white/5 flex items-center justify-between group hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-4">
                    <img src={item.thumbnail_url} className="w-20 h-20 rounded-2xl object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                    <div>
                      <h4 className="font-bold text-lg leading-tight">{item.title}</h4>
                      <div className="flex items-center gap-1.5 mt-1">
                        <ShieldCheck size={12} className="text-indigo-400" />
                        <p className="text-[9px] text-indigo-400 font-black uppercase tracking-widest">Verified Deed</p>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveMedia(item)} 
                    className="p-5 bg-white text-black rounded-full hover:scale-105 active:scale-95 transition shadow-2xl"
                  >
                    <Play size={20} fill="currentColor" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {previewItem && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="max-w-md w-full bg-zinc-900 rounded-[3.5rem] p-8 border border-white/10 relative shadow-2xl">
            <button onClick={() => setPreviewItem(null)} className="absolute top-8 right-8 text-zinc-500 hover:text-white transition"><X /></button>
            <img src={previewItem.thumbnail_url} className="w-full aspect-square rounded-[2.5rem] object-cover mb-8 shadow-2xl" />
            <h2 className="text-3xl font-black mb-1 leading-none">{previewItem.title}</h2>
            <p className="text-zinc-500 uppercase text-[10px] font-black tracking-[0.2em] mb-8">{previewItem.artist_name}</p>
            <button 
              onClick={() => handlePurchase(previewItem)}
              className="w-full py-5 bg-indigo-600 rounded-3xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-indigo-500 hover:scale-[1.02] active:scale-95 transition-all shadow-[0_20px_40px_-10px_rgba(79,70,229,0.4)]"
            >
              Acquire Deed — ${previewItem.price_current?.toFixed(2)}
            </button>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <Loader2 className="animate-spin text-indigo-500 mb-6" size={48} />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">Validating Chain Transaction</p>
        </div>
      )}

      {activeMedia && (
        <MediaPlayer 
          item={activeMedia} 
          onClose={() => setActiveMedia(null)} 
        />
      )}
    </div>
  );
}