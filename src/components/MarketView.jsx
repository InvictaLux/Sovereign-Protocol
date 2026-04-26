import { ShieldCheck } from 'lucide-react';

export default function MarketView({ marketItems, userVault, setSelectedAsset }) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <div className="mb-16">
        <h1 className="text-6xl font-black tracking-tighter italic uppercase mb-4">The Exchange</h1>
        <p className="text-zinc-500 max-w-lg font-medium">Verified digital property deeds secured on the Sovereign Protocol.</p>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-12">
        {marketItems.map(item => (
          <div key={item.id} onClick={() => setSelectedAsset(item)} className="group cursor-pointer">
            <div className="aspect-square rounded-[3.5rem] overflow-hidden bg-zinc-900 border border-white/5 relative mb-6 shadow-2xl transition-all duration-700 group-hover:border-indigo-500/50 group-hover:-translate-y-2">
              <img src={item.thumbnail_url || 'https://images.unsplash.com/photo-1514525253361-b83f859b71c0?auto=format&fit=crop&q=80&w=800'} className="w-full h-full object-cover group-hover:scale-110 transition duration-1000 grayscale-[0.5] group-hover:grayscale-0" alt="" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <div className="absolute bottom-6 right-6 px-4 py-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl text-[10px] font-black tracking-widest">
                ${typeof item.price_current === 'number' && item.price_current != null ? item.price_current.toFixed(2) : '0.00'}
              </div>
              
              {userVault.includes(item.id) && (
                <div className="absolute top-6 left-6 p-3 bg-indigo-500 rounded-2xl shadow-xl animate-in zoom-in duration-300">
                  <ShieldCheck size={20} />
                </div>
              )}
            </div>
            <h3 className="font-bold text-2xl px-2 mb-1 font-mono">{item.title}</h3>
            <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.3em] px-2 italic font-mono">{item.artist_name}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
