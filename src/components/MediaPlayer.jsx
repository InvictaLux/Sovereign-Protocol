import React, { useState } from 'react';
import { Play, Pause, X, Zap, ChevronDown } from 'lucide-react';

export default function MediaPlayer({ item, onClose }) {
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
      
      <div className="p-12 text-center">
        <p className="text-[9px] text-zinc-600 font-mono uppercase tracking-[0.2em]">
          Media Streamed via IPFS Node • Sovereign Protocol v1.0
        </p>
      </div>
    </div>
  );
}