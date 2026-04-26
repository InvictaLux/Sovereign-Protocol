import { useState, useEffect } from 'react'
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { useSovereign } from './hooks/useSovereign'
import MediaPlayer from './components/MediaPlayer'
import Market from './components/Market'
import './App.css'

// Firebase configuration - will be loaded from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

function App() {
  const [selectedMedia, setSelectedMedia] = useState(null)
  const [appId] = useState('sovereign-marketplace') // Default app ID
  
  // Rule 3 Pattern: Auth must complete before any Firestore queries
  const { 
    user, 
    loading, 
    marketplaceData, 
    userLibrary, 
    error, 
    isAuthenticated 
  } = useSovereign(appId)

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Initializing Sovereign...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-red-500 text-center">
          <h2 className="text-2xl font-bold mb-4">Connection Error</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Authenticating...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-2xl font-bold text-indigo-400">Sovereign</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-zinc-400">
                User ID: {user.uid.slice(0, 8)}...
              </span>
              <span className="text-sm text-zinc-400">
                Library: {userLibrary.length} items
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {selectedMedia ? (
          <MediaPlayer 
            media={selectedMedia} 
            onClose={() => setSelectedMedia(null)}
          />
        ) : (
          <Market 
            marketplaceData={marketplaceData}
            userLibrary={userLibrary}
            onMediaSelect={setSelectedMedia}
          />
        )}
      </main>
    </div>
  )
}

export default App
