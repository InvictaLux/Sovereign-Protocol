import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Debug environment variables
console.log('Environment check:', {
  apiKey: "AIzaSyAp9SVo4O0AUjECHbkgsNq7GMvwitDfb5s",
  authDomain: "sovereign-protocol.firebaseapp.com",
  projectId: "sovereign-protocol"
});

const firebaseConfig = {
  apiKey: "AIzaSyAp9SVo4O0AUjECHbkgsNq7GMvwitDfb5s",
  authDomain: "sovereign-protocol.firebaseapp.com",
  projectId: "sovereign-protocol",
  storageBucket: "sovereign-protocol.firebasestorage.app",
  messagingSenderId: "1032018451344",
  appId: "1:1032018451344:web:19f03f51496f67f4227115",
  measurementId: "G-MC3FD6VPKB"
};

// Validate required fields and check for placeholder values
const isInvalidConfig = !firebaseConfig.apiKey || 
                        !firebaseConfig.projectId || 
                        firebaseConfig.apiKey === 'your_actual_api_key_here' ||
                        firebaseConfig.projectId === 'your-project-id';

if (isInvalidConfig) {
  console.error('Firebase configuration is incomplete or contains placeholder values.');
  console.log('Please update your .env file with actual Firebase credentials.');
}

let app;
let auth;
let db;

// Use mock Firebase if config is invalid or if in development with placeholder values
if (isInvalidConfig && import.meta.env.DEV) {
  console.warn('Using mock Firebase for development due to invalid configuration');
  auth = {
    currentUser: null,
    signInAnonymously: () => Promise.resolve({ user: { uid: 'dev-user-123' } }),
    onAuthStateChanged: (callback) => {
      setTimeout(() => callback({ uid: 'dev-user-123' }), 100);
      return () => {};
    }
  };
  db = {
    collection: () => ({
      onSnapshot: (callback) => {
        // Mock sample data for development
        const mockDocs = [
          {
            id: 'mock-item-1',
            data: () => ({
              title: 'Synthetic Dreams',
              artist_name: 'The Sovereign',
              price_current: 1.25,
              thumbnail_url: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=800',
              media_type: 'audio'
            })
          },
          {
            id: 'mock-item-2', 
            data: () => ({
              title: 'Neon Citadel',
              artist_name: 'Binary Pulse',
              price_current: 3.50,
              thumbnail_url: 'https://images.unsplash.com/photo-1514525253344-f814d074e015?auto=format&fit=crop&q=80&w=800',
              media_type: 'video'
            })
          },
          {
            id: 'mock-item-3',
            data: () => ({
              title: 'Cold Storage',
              artist_name: 'Zero Day',
              price_current: 0.75,
              thumbnail_url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&q=80&w=800',
              media_type: 'audio'
            })
          }
        ];
        setTimeout(() => callback({ docs: mockDocs }), 100);
        return () => {};
      }
    }),
    doc: () => ({
      setDoc: () => Promise.resolve()
    })
  };
  console.log('Mock Firebase initialized for development');
} else {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log('Firebase initialized successfully');
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    // Provide fallback for development
    if (import.meta.env.DEV) {
      console.warn('Falling back to mock Firebase for development');
      auth = {
        currentUser: null,
        signInAnonymously: () => Promise.resolve({ user: { uid: 'dev-user-123' } }),
        onAuthStateChanged: (callback) => {
          setTimeout(() => callback({ uid: 'dev-user-123' }), 100);
          return () => {};
        }
      };
      db = {
        collection: () => ({
          onSnapshot: (callback) => {
            setTimeout(() => callback({ docs: [] }), 100);
            return () => {};
          }
        }),
        doc: () => ({
          setDoc: () => Promise.resolve()
        })
      };
      console.log('Mock Firebase initialized as fallback');
    } else {
      throw error;
    }
  }
}

export { auth, db };
export const appId = import.meta.env.VITE_APP_ID || 'sovereign-protocol-v1';