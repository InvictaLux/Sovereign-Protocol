import { useState, useRef } from 'react';
import { UploadCloud, FileAudio, FileVideo, FileImage, FileText } from 'lucide-react';
import { signInAnonymously } from 'firebase/auth';

export default function Studio({ user, auth }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileSelection = (file) => {
    // Validate file type
    const validTypes = [
      'audio/mp3', 'audio/mpeg', 'audio/wav',
      'video/mp4', 'video/quicktime', 'video/webm',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf'
    ];

    if (validTypes.includes(file.type) || file.name.match(/\.(mp3|wav|mp4|mov|webm|jpg|jpeg|png|gif|pdf)$/i)) {
      setSelectedFile(file);
    } else {
      alert('Please select a valid file type (MP3, Video, Image, or PDF)');
    }
  };

  const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    if (['mp3', 'wav', 'ogg'].includes(extension)) return <FileAudio size={48} />;
    if (['mp4', 'mov', 'webm'].includes(extension)) return <FileVideo size={48} />;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) return <FileImage size={48} />;
    if (['pdf'].includes(extension)) return <FileText size={48} />;
    return <UploadCloud size={48} />;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSignIn = async () => {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  if (!user) {
    return (
      <section className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <div className="mb-16">
          <h1 className="text-6xl font-black tracking-tighter italic uppercase mb-4">Creator Studio</h1>
          <p className="text-zinc-500 max-w-lg font-medium">Sign in to access the creator studio and upload your digital assets.</p>
        </div>
        
        <div className="max-w-md mx-auto bg-zinc-900/50 p-12 rounded-[3.5rem] border border-white/5 text-center">
          <UploadCloud size={64} className="mx-auto text-indigo-400 mb-6" />
          <p className="text-zinc-400 mb-8">Authentication required to access creator tools</p>
          <button
            onClick={handleSignIn}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-500 transition-colors"
          >
            Sign In Anonymously
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <div className="mb-16">
        <h1 className="text-6xl font-black tracking-tighter italic uppercase mb-4">Creator Studio</h1>
        <p className="text-zinc-500 max-w-lg font-medium">Upload and manage your digital assets on the Sovereign Protocol.</p>
      </div>

      <div className="max-w-4xl mx-auto">
        {/* Upload Zone */}
        <div
          className={`
            relative border-2 border-dashed rounded-[3.5rem] p-16 text-center transition-all duration-300
            ${isDragging 
              ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]' 
              : 'border-white/10 bg-zinc-900/30 hover:border-white/20 hover:bg-zinc-900/50'
            }
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".mp3,.wav,.mp4,.mov,.webm,.jpg,.jpeg,.png,.gif,.pdf,audio/*,video/*,image/*,.pdf"
            onChange={handleFileInput}
          />
          
          <div className="pointer-events-none">
            <UploadCloud 
              size={96} 
              className={`mx-auto mb-8 transition-colors duration-300 ${
                isDragging ? 'text-indigo-400' : 'text-zinc-600'
              }`} 
            />
            
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-white">
                {isDragging ? 'Drop file here' : 'Drag & Drop your files'}
              </h3>
              <p className="text-zinc-500">
                or click to browse from your device
              </p>
              <div className="flex flex-wrap justify-center gap-4 text-xs text-zinc-600">
                <span className="px-3 py-1 bg-zinc-800 rounded-full">MP3</span>
                <span className="px-3 py-1 bg-zinc-800 rounded-full">Video</span>
                <span className="px-3 py-1 bg-zinc-800 rounded-full">Images</span>
                <span className="px-3 py-1 bg-zinc-800 rounded-full">PDF</span>
              </div>
            </div>
          </div>
        </div>

        {/* Selected File Preview */}
        {selectedFile && (
          <div className="mt-8 bg-zinc-900/30 p-8 rounded-[3.5rem] border border-white/5">
            <div className="flex items-center gap-6">
              <div className="p-4 bg-indigo-500/20 rounded-2xl text-indigo-400">
                {getFileIcon(selectedFile.name)}
              </div>
              <div className="flex-1">
                <h4 className="text-xl font-bold text-white mb-2">{selectedFile.name}</h4>
                <p className="text-zinc-500">{formatFileSize(selectedFile.size)}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedFile(null);
                }}
                className="px-6 py-3 bg-red-500/20 text-red-400 rounded-2xl hover:bg-red-500/30 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
