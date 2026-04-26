import { Lock, ShieldCheck, Play } from 'lucide-react';

export default function LibraryView({ userVault, marketItems }) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <div className="mb-16">
        <h1 className="text-6xl font-black tracking-tighter italic uppercase mb-4">Digital Library</h1>
        <p className="text-zinc-500 max-w-lg font-medium">Your collection of verified digital assets and media.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {userVault.length === 0 ? (
          <div className="col-span-full py-48 text-center border-2 border-dashed border-white/5 rounded-[4rem]">
            <Lock className="mx-auto text-zinc-900 mb-6" size={64} />
            <p className="text-zinc-700 font-black tracking-[0.4em] uppercase text-xs">No Assets in Library</p>
          </div>
        ) : (
          marketItems.filter(i => userVault.includes(i.id)).map(item => (
            <div key={item.id} className="bg-zinc-900/30 p-8 rounded-[3.5rem] border border-white/5 flex items-center justify-between group hover:bg-zinc-900/50 transition-all duration-500">
              <div className="flex items-center gap-8">
                <img src={item.thumbnail_url} className="w-28 h-28 rounded-3xl object-cover shadow-2xl grayscale group-hover:grayscale-0 transition-all duration-1000 bg-zinc-900 border border-white/5" alt="" />
                <div>
                  <h4 className="font-bold text-3xl mb-2 tracking-tight">{item.title}</h4>
                  <div className="flex items-center gap-2 text-indigo-400">
                    <ShieldCheck size={16} />
                    <p className="text-[11px] font-black uppercase tracking-widest italic">Verified Asset</p>
                  </div>
                </div>
              </div>
              <button className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 active:scale-90 transition shadow-2xl">
                <Play size={28} fill="currentColor" className="ml-1" />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
