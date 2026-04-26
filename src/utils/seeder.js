import { db, appId } from '../firebase';
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';

export const seedMarketplace = async () => {
  try {
    console.log('🌱 Checking marketplace data...');
    
    // We use the appId constant from our central firebase file for consistency
    const marketCollection = collection(db, 'artifacts', appId, 'public', 'data', 'marketplace_items');
    const snapshot = await getDocs(marketCollection);
    
    if (!snapshot.empty) {
      console.log('✅ Marketplace already seeded with', snapshot.size, 'items');
      return;
    }
    
    console.log('📦 Seeding marketplace with Sovereign sample items...');
    
    const sampleItems = [
      {
        title: 'After Hours',
        artist_name: 'The Sovereign', // Component expects artist_name
        description: 'A mesmerizing late-night jazz session recorded in an intimate studio setting',
        price_current: 1.00, // Component expects price_current as a number
        media_type: 'audio',
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        thumbnail_url: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800&h=600&fit=crop',
        views: 0,
        likes: 0,
        createdAt: serverTimestamp()
      },
      {
        title: 'Live at The Citadel',
        artist_name: 'Neon Architect',
        description: 'An explosive live performance captured at the legendary Citadel venue',
        price_current: 2.50,
        media_type: 'video',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1471478311145-2fd8b5fcc693?w=800&h=600&fit=crop',
        views: 0,
        likes: 0,
        createdAt: serverTimestamp()
      },
      {
        title: 'Cold Storage',
        artist_name: 'Binary Pulse',
        description: 'A haunting ambient soundscape that explores the depths of digital preservation',
        price_current: 0.50,
        media_type: 'audio',
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        thumbnail_url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=600&fit=crop',
        views: 0,
        likes: 0,
        createdAt: serverTimestamp()
      }
    ];
    
    for (const item of sampleItems) {
      const docRef = doc(marketCollection);
      // We store the ID inside the document as well for easier state management in React
      await setDoc(docRef, { ...item, id: docRef.id });
      console.log(`✨ Added: ${item.title}`);
    }
    
    console.log('🎉 Marketplace seeded successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding marketplace:', error);
  }
};