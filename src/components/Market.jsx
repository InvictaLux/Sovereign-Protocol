import { ShieldCheck } from 'lucide-react';

export default function Market({ items = [], ownedIds = [], onItemClick = () => {} }) {
  // Safety check to prevent "map" error if items is null or undefined
  if (!items || !Array.isArray(items)) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-8 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="aspect-square rounded-[2.5rem] bg-zinc-900 border border-white/5" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-8 animate-in fade-in duration-700">
      {items.map((item) => (
        <div 
          key={item.id} 
          onClick={() => onItemClick(item)}
          className="group cursor-pointer"
        >
          <div className="aspect-square rounded-[2.5rem] overflow-hidden bg-zinc-900 border border-white/5 relative mb-4 shadow-xl group-hover:border-indigo-500/50 transition-all duration-500">
            <img 
              src={item.thumbnail_url} 
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-110 transition duration-700" 
              onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000'; }}
            />
            <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl text-[10px] font-black tracking-widest">
              ${typeof item.price_current === 'number' ? item.price_current.toFixed(2) : '0.00'}
            </div>
            {ownedIds && ownedIds.includes(item.id) && (
              <div className="absolute top-4 left-4 p-2 bg-indigo-500 rounded-2xl shadow-2xl">
                <ShieldCheck size={14} className="text-white" />
              </div>
            )}
          </div>
          <h3 className="font-bold text-sm px-1 truncate">{item.title || 'Untitled Asset'}</h3>
          <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] px-1 mt-1">
            {item.artist_name || 'Unknown Artist'}
          </p>
        </div>
      ))}
    </div>
  );
}