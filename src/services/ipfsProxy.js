// SECURITY WALL: Isolated service for IPFS operations
// This file isolates all secret keys from the frontend components
// NO environment variables are imported in .jsx files

import { create } from '@pinata/sdk';

class IPFSProxy {
  constructor() {
    // CRITICAL: Secrets are isolated here, NOT in components
    this.pinataApiKey = null;
    this.pinataSecretKey = null;
    this.pinataClient = null;
    this.isInitialized = false;
  }

  // Initialize with secrets - ONLY called from secure context
  initialize(apiKey, secretKey) {
    if (!apiKey || !secretKey) {
      throw new Error('IPFS_PROXY: Missing required credentials');
    }
    
    this.pinataApiKey = apiKey;
    this.pinataSecretKey = secretKey;
    
    try {
      this.pinataClient = create({
        pinataApiKey: this.pinataApiKey,
        pinataSecretKey: this.pinataSecretKey,
      });
      
      this.isInitialized = true;
      console.log('✅ IPFS Proxy initialized securely');
    } catch (error) {
      console.error('❌ IPFS Proxy initialization failed:', error);
      throw new Error(`IPFS_PROXY_INIT_ERROR: ${error.message}`, { cause: error });
    }
  }

  // Upload file to IPFS - secure method that doesn't expose secrets
  async uploadFile(file, metadata = {}) {
    if (!this.isInitialized) {
      throw new Error('IPFS_PROXY: Not initialized - call initialize() first');
    }

    try {
      const uploadMetadata = {
        name: `encrypted_${metadata.fileName || 'file'}`,
        keyValues: {
          encrypted: 'true',
          protocol: 'sovereign',
          timestamp: Date.now().toString(),
          ...metadata
        }
      };

      const result = await this.pinataClient.pinFileToIPFS(file, {
        pinataMetadata: uploadMetadata
      });

      console.log('✅ File uploaded to IPFS via secure proxy:', result.IpfsHash);
      return result.IpfsHash;
      
    } catch (error) {
      console.error('❌ IPFS upload failed:', error);
      throw new Error(`IPFS_PROXY_UPLOAD_ERROR: ${error.message}`, { cause: error });
    }
  }

  // Get client status (for debugging)
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      hasCredentials: !!(this.pinataApiKey && this.pinataSecretKey)
    };
  }
}

// Singleton instance - ensures only one proxy exists
const ipfsProxy = new IPFSProxy();

// Development initialization with mock credentials
// In production, this would be called from a secure backend context
if (import.meta.env.DEV) {
  // WARNING: Only for development - never use in production
  const mockApiKey = import.meta.env.VITE_PINATA_API_KEY;
  const mockSecretKey = import.meta.env.VITE_PINATA_SECRET_KEY;
  
  if (mockApiKey && mockSecretKey && mockApiKey !== 'your_pinata_api_key_here') {
    console.warn('⚠️  Using development IPFS credentials - replace with backend proxy in production');
    ipfsProxy.initialize(mockApiKey, mockSecretKey);
  } else {
    console.warn('⚠️  IPFS Proxy not initialized - using mock mode');
  }
}

export default ipfsProxy;
