import { useMemo, useState } from 'react';
import { Lock, ShieldCheck, Play, Sparkles } from 'lucide-react';
import MediaPlayer from './MediaPlayer';

export default function LibraryView({ libraryItems = [] }) {
  const [activeItem, setActiveItem] = useState(null);

  const sortedItems = useMemo(
    () => [...libraryItems].sort((a, b) => (b?.acquiredAt?.seconds || 0) - (a?.acquiredAt?.seconds || 0)),
    [libraryItems]
  );

  return (
    <section className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <div className="mb-16">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="text-indigo-400" size={20} />
          <p className="text-xs uppercase tracking-[0.35em] text-indigo-300 font-mono">Verified Entitlements</p>
        </div>
        <h1 className="text-6xl font-black tracking-tighter italic uppercase mb-4">Your Library</h1>
        <p className="text-zinc-400 max-w-xl font-medium">
          Instantly play every purchased title. Rights are authenticated in the background and playback starts fast.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8">
        {sortedItems.length === 0 ? (
          <div className="col-span-full py-36 text-center border-2 border-dashed border-white/10 rounded-[3rem] bg-zinc-900/30">
            <Lock className="mx-auto text-zinc-700 mb-6" size={64} />
            <p className="text-zinc-500 font-black tracking-[0.35em] uppercase text-xs">No Verified Assets Yet</p>
            <p className="text-zinc-600 mt-4 text-sm">Acquire a title from the exchange and it appears here instantly.</p>
          </div>
        ) : (
          sortedItems.map((item) => (
            <article
              key={item.id}
              className="group overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-900/40 hover:bg-zinc-900/60 transition-all duration-500"
            >
              <div className="aspect-square relative">
                <img
                  src={item.thumbnail_url || 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80&w=800'}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  alt={item.title || 'Owned media'}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <ShieldCheck size={16} />
                    <p className="text-[10px] font-black uppercase tracking-[0.25em]">Owned</p>
                  </div>
                  <button
                    onClick={() => setActiveItem(item)}
                    className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
                  >
                    <Play size={20} fill="currentColor" className="ml-0.5" />
                  </button>
                </div>
              </div>
              <div className="p-5 text-left">
                <h4 className="font-black text-2xl tracking-tight mb-1">{item.title || 'Untitled Asset'}</h4>
                <p className="text-zinc-500 text-xs uppercase tracking-[0.22em] font-mono">{item.artist_name || 'Sovereign Creator'}</p>
              </div>
            </article>
          ))
        )}
      </div>

      {activeItem && (
        <MediaPlayer item={activeItem} onClose={() => setActiveItem(null)} />
      )}
    </section>
  );
}
