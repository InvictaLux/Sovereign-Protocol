import { useState, useEffect, useCallback } from 'react';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot,
  query,
  where,
  orderBy,
  limit 
} from 'firebase/firestore';

export const useSovereign = (appId) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marketplaceData, setMarketplaceData] = useState([]);
  const [userLibrary, setUserLibrary] = useState([]);
  const [error, setError] = useState(null);

  const auth = getAuth();
  const db = getFirestore();

  // Anonymous authentication fallback
  const signInAnonymouslyIfNeeded = useCallback(async () => {
    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
    } catch (error) {
      console.error('Anonymous sign-in failed:', error);
      setError(error.message);
    }
  }, [auth]);

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, [auth]);

  // Initialize authentication
  useEffect(() => {
    if (!user && !loading) {
      signInAnonymouslyIfNeeded();
    }
  }, [user, loading, signInAnonymouslyIfNeeded]);

  // Listen to marketplace data
  useEffect(() => {
    if (!user || !appId) return;

    const marketplaceRef = collection(db, 'artifacts', appId, 'public', 'data');
    const q = query(
      marketplaceRef,
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMarketplaceData(data);
        setError(null);
      },
      (error) => {
        console.error('Marketplace listener error:', error);
        setError(error.message);
      }
    );

    return unsubscribe;
  }, [user, appId, db]);

  // Listen to user's private library
  useEffect(() => {
    if (!user || !appId) return;

    const libraryRef = doc(db, 'artifacts', appId, 'users', user.uid, 'library');
    
    const unsubscribe = onSnapshot(
      libraryRef,
      (doc) => {
        if (doc.exists()) {
          setUserLibrary(doc.data().items || []);
        } else {
          setUserLibrary([]);
        }
        setError(null);
      },
      (error) => {
        console.error('Library listener error:', error);
        setError(error.message);
      }
    );

    return unsubscribe;
  }, [user, appId, db]);

  const signOutUser = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
      setError(error.message);
    }
  }, [auth]);

  return {
    user,
    loading,
    marketplaceData,
    userLibrary,
    error,
    signOutUser,
    isAuthenticated: !!user
  };
};
