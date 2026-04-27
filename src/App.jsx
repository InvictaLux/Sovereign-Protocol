import { useState, useEffect, Suspense, lazy, useMemo, useRef } from 'react';
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  signInWithPopup
} from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { 
  Zap, 
  Shield, 
  X, 
  Loader2, 
  Database,
  Play,
  Wrench,
  Fingerprint,
  Verified,
  Sparkles,
  User,
  Mail
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
  const motionEase = [0.22, 1, 0.36, 1];
  const transitionFast = { duration: 0.2, ease: motionEase };
  const transitionBase = { duration: 0.24, ease: motionEase };
  const transitionCurtain = { duration: 0.42, ease: motionEase };
  const [view, setView] = useState(() => getViewFromPath(window.location.pathname));
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
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
  const [walletAddress, setWalletAddress] = useState('');
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);
  const [showAuthSheet, setShowAuthSheet] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const authSheetPanelRef = useRef(null);
  const profileMenuRef = useRef(null);
  const profileButtonRef = useRef(null);
  const toastTimeoutRef = useRef(null);

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

  const requestWalletHandshake = async () => {
    if (!window.ethereum) {
      return null;
    }

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const address = Array.isArray(accounts) && accounts[0] ? accounts[0] : null;
    if (address) {
      setWalletAddress(address);
    }
    return address;
  };

  const runPostAuthSequence = async () => {
    try {
      await runIdentitySequence();
    } catch (error) {
      console.error('Post-auth sequence failed:', error);
      setShowIdentitySequence(false);
    }
  };

  const showToast = (message, tone = 'info') => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    const toastId = Date.now();
    setToast({ id: toastId, message, tone });

    toastTimeoutRef.current = window.setTimeout(() => {
      setToast((currentToast) => (currentToast?.id === toastId ? null : currentToast));
    }, 3200);
  };

  const getFriendlyAuthError = (error) => {
    const signature = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
    if (
      signature.includes('auth/configuration-not-found') ||
      signature.includes('api_key_http_referrer_blocked') ||
      signature.includes('identitytoolkit') ||
      signature.includes('403')
    ) {
      return 'Connection Interrupted. Please check your network or try Email Sign-in.';
    }

    return error?.message || 'Connection Interrupted. Please check your network or try Email Sign-in.';
  };

  const waitForAuthUser = (expectedUid) => {
    if (auth.currentUser && (!expectedUid || auth.currentUser.uid === expectedUid)) {
      return Promise.resolve(auth.currentUser);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        unsubscribe();
        reject(new Error('AUTH_USER_TIMEOUT'));
      }, 4500);

      const unsubscribe = onAuthStateChanged(
        auth,
        (nextUser) => {
          if (!nextUser) return;
          if (expectedUid && nextUser.uid !== expectedUid) return;

          window.clearTimeout(timeoutId);
          unsubscribe();
          resolve(nextUser);
        },
        (error) => {
          window.clearTimeout(timeoutId);
          unsubscribe();
          reject(error);
        }
      );
    });
  };

  const handleProviderAuth = async (providerKey) => {
    if (isAuthSubmitting) return;

    setIsAuthSubmitting(true);
    setAuthError('');

    try {
      let authUser;
      if (providerKey === 'google') {
        const provider = new GoogleAuthProvider();
        const credential = await signInWithPopup(auth, provider);
        authUser = credential?.user;
      } else {
        const provider = new OAuthProvider('apple.com');
        provider.addScope('email');
        provider.addScope('name');
        const credential = await signInWithPopup(auth, provider);
        authUser = credential?.user;
      }

      await waitForAuthUser(authUser?.uid);
      setShowAuthSheet(false);
      await runPostAuthSequence();
      showToast('Welcome back, Sovereign.', 'success');
    } catch (error) {
      console.error('Provider auth failed:', error);
      const friendlyError = getFriendlyAuthError(error);
      setAuthError(friendlyError);
      showToast(friendlyError, 'error');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleEmailAuth = async (event) => {
    event.preventDefault();
    if (isAuthSubmitting) return;

    if (!email || !password) {
      setAuthError('Enter both email and password.');
      return;
    }

    setIsAuthSubmitting(true);
    setAuthError('');

    try {
      let authUser;
      if (authMode === 'signup') {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        authUser = credential?.user;
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        authUser = credential?.user;
      }

      await waitForAuthUser(authUser?.uid);
      setShowAuthSheet(false);
      await runPostAuthSequence();
      showToast('Welcome back, Sovereign.', 'success');
    } catch (error) {
      console.error('Email auth failed:', error);
      const friendlyError = getFriendlyAuthError(error);
      setAuthError(friendlyError);
      showToast(friendlyError, 'error');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleConnect = async () => {
    if (!user) {
      setAuthError('');
      setShowAuthSheet(true);
      setShowProfileMenu(false);
      return;
    }

    if (isWalletConnecting || walletAddress) return;

    setIsWalletConnecting(true);
    try {
      const connectedWallet = await requestWalletHandshake();
      if (!connectedWallet && window.ethereum) {
        alert('No wallet detected. Install MetaMask to connect.');
      }
    } catch (error) {
      if (error?.code === 4001) {
        return;
      }

      console.error('Wallet connect failed:', error);
      alert(error?.message || 'Wallet connection failed.');
    } finally {
      setIsWalletConnecting(false);
    }
  };

  const walletDisplay = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : user?.email
      ? user.email
      : user
        ? `UID ${user.uid.slice(0, 6)}…`
        : 'Connect';

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setShowProfileMenu(false);
      setWalletAddress('');
    } catch (error) {
      console.error('Sign out failed:', error);
      alert(error?.message || 'Unable to sign out right now.');
    }
  };

  const navigateToView = (nextView) => {
    setShowProfileMenu(false);
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

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!showAuthSheet && !showProfileMenu) return;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (showAuthSheet) {
        setShowAuthSheet(false);
      }
      if (showProfileMenu) {
        setShowProfileMenu(false);
      }
    };

    const onPointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (showAuthSheet && authSheetPanelRef.current && !authSheetPanelRef.current.contains(target)) {
        setShowAuthSheet(false);
      }

      if (
        showProfileMenu &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(target) &&
        !(profileButtonRef.current && profileButtonRef.current.contains(target))
      ) {
        setShowProfileMenu(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [showAuthSheet, showProfileMenu]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    let isMounted = true;

    const syncWallet = async () => {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (!isMounted) return;
        const address = Array.isArray(accounts) && accounts[0] ? accounts[0] : '';
        setWalletAddress(address);
      } catch (error) {
        console.error('Wallet account sync failed:', error);
      }
    };

    const onAccountsChanged = (accounts) => {
      const address = Array.isArray(accounts) && accounts[0] ? accounts[0] : '';
      setWalletAddress(address);
    };

    syncWallet();
    window.ethereum.on?.('accountsChanged', onAccountsChanged);

    return () => {
      isMounted = false;
      window.ethereum.removeListener?.('accountsChanged', onAccountsChanged);
    };
  }, [user]);

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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigateToView('market')}>
            <Database size={24} className="text-white group-hover:rotate-12 transition-all" />
            <span className="text-2xl sm:text-3xl font-black italic tracking-tighter text-white">Sovereign</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleConnect}
              className="min-h-11 flex-shrink-0 border border-white/20 px-3 sm:px-4 py-2 rounded-full hover:bg-white hover:text-black transition-all duration-500 shadow-[0_10px_24px_rgba(0,0,0,0.35)] font-bold text-[10px] sm:text-xs tracking-[0.16em] uppercase"
            >
              {isWalletConnecting ? 'Connecting' : walletDisplay}
            </button>
            <button
              ref={profileButtonRef}
              onClick={() => {
                if (!user) {
                  setAuthError('');
                  setShowAuthSheet(true);
                  return;
                }
                setShowProfileMenu((prev) => !prev);
              }}
              className="w-11 h-11 rounded-full border border-white/20 bg-black/40 hover:bg-white hover:text-black transition flex items-center justify-center"
            >
              <User size={16} />
            </button>
          </div>
        </div>

        <div className="hidden md:block border-t border-white/5">
          <nav className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-4 lg:gap-6">
            <button onClick={() => navigateToView('market')} className={`min-h-11 flex items-center gap-2 px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold tracking-widest uppercase text-white/70 hover:text-white transition-all ${view === 'market' ? 'text-white border-b border-indigo-500' : ''}`}>
              <Shield size={18} />
              <span className="hidden lg:inline">Exchange</span>
              <span className="sr-only">Exchange</span>
            </button>
            <button onClick={() => navigateToView('library')} className={`min-h-11 flex items-center gap-2 px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold tracking-widest uppercase text-white/70 hover:text-white transition-all ${view === 'library' ? 'text-white border-b border-indigo-500' : ''}`}>
              <Play size={18} />
              <span className="hidden lg:inline">Library</span>
              <span className="sr-only">Library</span>
            </button>
            <button onClick={() => navigateToView('studio')} className={`min-h-11 flex items-center gap-2 px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold tracking-widest uppercase text-white/70 hover:text-white transition-all ${view === 'studio' ? 'text-white border-b border-indigo-500' : ''}`}>
              <Wrench size={18} />
              <span className="hidden lg:inline">Studio</span>
              <span className="sr-only">Studio</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Viewport */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 md:pt-36 pb-32 md:pb-40">
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
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <Sparkles size={18} className="text-indigo-300 mt-1" />
            <div className="sm:flex-1 min-w-0">
              <p className="text-white font-semibold">Sign in to Secure Your Rights</p>
              <p className="text-zinc-400 text-sm mt-1">Email, Apple, or Google creates your secure protocol wallet in the background.</p>
            </div>
            <button
              onClick={handleConnect}
              className="w-full sm:w-auto min-h-11 sm:ml-auto px-3 py-2 rounded-lg border border-indigo-400/40 text-indigo-200 text-[10px] uppercase tracking-[0.2em] hover:bg-indigo-500 hover:text-white transition"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      <div className="md:hidden fixed inset-x-0 bottom-0 z-[140] border-t border-white/10 bg-black/90 backdrop-blur-xl">
        <nav className="grid grid-cols-3">
          <button onClick={() => navigateToView('market')} className={`min-h-14 flex flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-[0.15em] ${view === 'market' ? 'text-white' : 'text-zinc-500'}`}>
            <Shield size={17} />
            <span className="sr-only">Exchange</span>
          </button>
          <button onClick={() => navigateToView('library')} className={`min-h-14 flex flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-[0.15em] ${view === 'library' ? 'text-white' : 'text-zinc-500'}`}>
            <Play size={17} />
            <span className="sr-only">Library</span>
          </button>
          <button onClick={() => navigateToView('studio')} className={`min-h-14 flex flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-[0.15em] ${view === 'studio' ? 'text-white' : 'text-zinc-500'}`}>
            <Wrench size={17} />
            <span className="sr-only">Studio</span>
          </button>
        </nav>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={transitionFast}
            className={`fixed top-4 right-4 z-[230] max-w-[calc(100vw-2rem)] rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${toast.tone === 'error' ? 'border-red-300/35 bg-red-500/12 text-red-100' : 'border-emerald-300/35 bg-emerald-500/12 text-emerald-100'}`}
          >
            <p className="text-xs sm:text-sm font-semibold tracking-[0.02em]">{toast.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

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
            transition={transitionBase}
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
        {showProfileMenu && user && (
          <>
            <motion.div
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              animate={{ opacity: 1, backdropFilter: 'blur(2px)' }}
              exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              transition={transitionFast}
              className="fixed inset-0 z-[204] bg-black/25"
              aria-hidden="true"
            />
            <motion.div
              ref={profileMenuRef}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={transitionFast}
              className="fixed right-4 sm:right-6 top-16 sm:top-20 z-[205] w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-black/90 backdrop-blur-xl p-4 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-500/30 border border-indigo-300/40 flex items-center justify-center text-xs font-black uppercase">
                  {(user.email || walletAddress || user.uid || 'S').slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{user.email || 'Sovereign Member'}</p>
                  <p className="text-zinc-500 text-xs truncate">{walletAddress || `UID ${user.uid}`}</p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {!walletAddress && window.ethereum && (
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      handleConnect();
                    }}
                    className="w-full min-h-11 rounded-xl border border-indigo-400/40 text-indigo-200 hover:bg-indigo-500 hover:text-white transition text-xs uppercase tracking-[0.15em]"
                  >
                    Connect Wallet
                  </button>
                )}
                <button
                  onClick={handleSignOut}
                  className="w-full min-h-11 rounded-xl border border-white/15 text-zinc-300 hover:bg-white hover:text-black transition text-xs uppercase tracking-[0.15em]"
                >
                  Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAuthSheet && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={transitionBase}
            className="fixed inset-0 z-[220] bg-black/75 flex items-center justify-center p-4"
          >
            <motion.div
              ref={authSheetPanelRef}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={transitionBase}
              className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0a0a0a] p-5 sm:p-7 shadow-2xl"
            >
              <p className="text-white text-xl font-black tracking-tight">Sign in to Secure Your Rights</p>
              <p className="text-zinc-400 text-sm mt-2">Choose how you want to enter Sovereign.</p>

              <div className="mt-5 space-y-3">
                <button
                  onClick={() => handleProviderAuth('google')}
                  disabled={isAuthSubmitting}
                  className="w-full min-h-11 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition text-sm font-semibold"
                >
                  Continue with Google
                </button>
                <button
                  onClick={() => handleProviderAuth('apple')}
                  disabled={isAuthSubmitting}
                  className="w-full min-h-11 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition text-sm font-semibold"
                >
                  Continue with Apple
                </button>
              </div>

              <div className="my-5 flex items-center gap-3 text-zinc-500 text-xs uppercase tracking-[0.2em]">
                <div className="h-px bg-white/10 flex-1" />
                <span>Email</span>
                <div className="h-px bg-white/10 flex-1" />
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-3">
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="w-full min-h-11 bg-zinc-950 border border-white/10 rounded-xl pl-9 pr-3 text-sm text-white"
                  />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  className="w-full min-h-11 bg-zinc-950 border border-white/10 rounded-xl px-3 text-sm text-white"
                />
                <button
                  type="submit"
                  disabled={isAuthSubmitting}
                  className="w-full min-h-11 rounded-xl border border-indigo-400/40 text-indigo-200 hover:bg-indigo-500 hover:text-white transition text-sm font-semibold"
                >
                  {authMode === 'signup' ? 'Create Account' : 'Sign In with Email'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setAuthMode((prev) => (prev === 'signin' ? 'signup' : 'signin'))}
                className="mt-4 text-xs text-zinc-400 hover:text-white transition"
              >
                {authMode === 'signin' ? 'New here? Create an account.' : 'Already have an account? Sign in.'}
              </button>

              {authError && <p className="mt-3 text-sm text-red-300">{authError}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showIdentitySequence && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transitionCurtain}
            className="fixed inset-0 z-[210] bg-black/95 backdrop-blur-xl flex items-center justify-center"
          >
            <motion.p
              key={identityWords[identityWordIndex]}
              initial={{ opacity: 0, y: viewportWidth < 640 ? 8 : 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: viewportWidth < 640 ? -8 : -12, scale: 1.02 }}
              transition={transitionCurtain}
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
          transition={transitionBase}
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6"
        >
          <motion.div
            layoutId={`asset-card-${selectedAsset.id}`}
            initial={{ opacity: 0, y: 8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={transitionBase}
            className="max-w-md w-full bg-[#0a0a0a] rounded-[2rem] sm:rounded-[4.5rem] p-5 sm:p-12 border border-white/10 relative shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 sm:p-12">
               <button onClick={() => setSelectedAsset(null)} className="text-zinc-600 hover:text-white transition"><X size={32} /></button>
            </div>
            
            <img src={selectedAsset.thumbnail_url || 'https://images.unsplash.com/photo-1514525253361-b83f859b71c0?auto=format&fit=crop&q=80&w=800'} className="w-full aspect-square rounded-[1.6rem] sm:rounded-[3.5rem] object-cover mb-6 sm:mb-12 shadow-2xl border border-white/5" alt="" />
            
            <h2 className="text-3xl sm:text-5xl font-black mb-2 uppercase tracking-tighter italic leading-none break-words">{selectedAsset.title}</h2>
            <p className="text-zinc-500 uppercase text-[11px] sm:text-[12px] font-black tracking-[0.25em] sm:tracking-[0.4em] mb-6 sm:mb-12 italic break-words">{selectedAsset.artist_name}</p>
            
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
              className={`w-full min-h-11 py-4 sm:py-7 rounded-[1.2rem] sm:rounded-[2rem] font-black uppercase text-[11px] sm:text-[12px] tracking-[0.18em] sm:tracking-[0.3em] transition-all duration-700 shadow-2xl ${
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