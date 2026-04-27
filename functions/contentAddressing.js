// STORAGE DENSITY: Content-addressing logic to prevent duplicate uploads
const {getFirestore} = require('firebase-admin/firestore');

class ContentAddressing {
  constructor() {
    this.db = getFirestore();
  }

  // Check if content already exists by hash
  async checkContentHash(contentHash) {
    try {
      const contentRef = this.db.collection('content_hashes').doc(contentHash);
      const contentDoc = await contentRef.get();
      
      if (contentDoc.exists) {
        console.log(`Duplicate content found: ${contentHash}`);
        return contentDoc.data();
      }
      
      return null;
    } catch (error) {
      console.error('Error checking content hash:', error);
      throw error;
    }
  }

  // Store new content hash mapping
  async storeContentHash(contentHash, ipfsHash, metadata) {
    try {
      const contentRef = this.db.collection('content_hashes').doc(contentHash);
      await contentRef.set({
        ipfsHash,
        contentHash,
        createdAt: new Date().toISOString(),
        ...metadata
      });
      
      console.log(`Content hash stored: ${contentHash} -> ${ipfsHash}`);
      return true;
    } catch (error) {
      console.error('Error storing content hash:', error);
      throw error;
    }
  }

  // Get content by hash
  async getContentByHash(contentHash) {
    try {
      const contentRef = this.db.collection('content_hashes').doc(contentHash);
      const contentDoc = await contentRef.get();
      
      if (contentDoc.exists) {
        return contentDoc.data();
      }
      
      return null;
    } catch (error) {
      console.error('Error getting content by hash:', error);
      throw error;
    }
  }

  // Clean up old content hashes (optional maintenance)
  async cleanupOldContent(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      const oldContentRef = this.db.collection('content_hashes')
        .where('createdAt', '<', cutoffDate);
      
      const snapshot = await oldContentRef.get();
      
      const batch = this.db.batch();
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      console.log(`Cleaned up ${snapshot.size} old content hashes`);
      
      return snapshot.size;
    } catch (error) {
      console.error('Error cleaning up old content:', error);
      throw error;
    }
  }
}

module.exports = ContentAddressing;
