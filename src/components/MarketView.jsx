import { useMemo, useState } from 'react';
import { ShieldCheck, Flame, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const fallbackImage = 'https://images.unsplash.com/photo-1514525253361-b83f859b71c0?auto=format&fit=crop&q=80&w=800';

export default function MarketView({ marketItems, userVault, setSelectedAsset, onSelectCreator, onDirectBuy }) {
  const [activeFilter, setActiveFilter] = useState('all');

  const filterChips = [
    { key: 'video', label: 'Movies' },
    { key: 'audio', label: 'Music' },
    { key: 'image', label: 'Art' }
  ];

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return marketItems;
    return marketItems.filter((item) => item.media_type === activeFilter || item.mediaType === activeFilter);
  }, [activeFilter, marketItems]);

  const newReleases = useMemo(() => {
    return [...filteredItems]
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || a.listed_at || 0).getTime();
        const bTime = new Date(b.createdAt || b.listed_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 8);
  }, [filteredItems]);

  const trendingNow = useMemo(() => {
    return [...filteredItems]
      .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
      .slice(0, 9);
  }, [filteredItems]);

  const popularArtists = useMemo(() => {
    const grouped = new Map();

    marketItems.forEach((item) => {
      const creatorKey = item.creatorAddress || item.creator_address || item.artist_name || item.id;
      const current = grouped.get(creatorKey) || {
        id: creatorKey,
        name: item.artist_name || 'Sovereign Creator',
        avatar: item.thumbnail_url || fallbackImage,
        sales: 0,
        recentSale: false,
        items: []
      };

      current.sales += item.sales_count || 0;
      current.recentSale = current.recentSale || !!item.latest_sale_at;
      current.items.push(item);
      if (!current.avatar && item.thumbnail_url) {
        current.avatar = item.thumbnail_url;
      }

      grouped.set(creatorKey, current);
    });

    return Array.from(grouped.values())
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 8);
  }, [marketItems]);

  return (
    <section className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <div className="mb-12 sm:mb-16">
        <div className="flex items-center gap-2 mb-4 text-indigo-300">
          <Sparkles size={16} />
          <p className="text-[10px] uppercase tracking-[0.35em] font-mono">Discovery Gallery</p>
        </div>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tighter italic uppercase mb-4">Popular</h1>
        <p className="text-zinc-500 max-w-lg font-medium">Discover sovereign releases, trending creators, and direct-buy titles.</p>
      </div>

      <div className="space-y-14">
        <section>
          <div className="flex flex-wrap items-center gap-3">
            <motion.button
              type="button"
              onClick={() => setActiveFilter('all')}
              whileTap={{ scale: 0.96 }}
              className={`min-h-11 px-4 py-2 rounded-full text-xs uppercase tracking-[0.22em] border transition ${activeFilter === 'all' ? 'bg-white text-black border-white' : 'bg-black/40 border-white/20 text-zinc-300 hover:border-white/40'}`}
            >
              All
            </motion.button>
            {filterChips.map((chip) => (
              <motion.button
                key={chip.key}
                type="button"
                onClick={() => setActiveFilter(chip.key)}
                whileTap={{ scale: 0.96 }}
                className={`min-h-11 px-4 py-2 rounded-full text-xs uppercase tracking-[0.22em] border transition ${activeFilter === chip.key ? 'bg-indigo-500/90 text-white border-indigo-300/60 shadow-[0_0_20px_rgba(99,102,241,0.35)]' : 'bg-black/40 border-white/20 text-zinc-300 hover:border-white/40'}`}
              >
                {chip.label}
              </motion.button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-black tracking-tight">New Releases</h2>
            <p className="text-zinc-500 text-xs uppercase tracking-[0.25em] font-mono">Latest Drops</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <AnimatePresence mode="popLayout">
              {newReleases.map((item) => (
                <motion.button
                  key={item.id}
                  layout
                  layoutId={`asset-card-${item.id}`}
                  onClick={() => setSelectedAsset(item)}
                  className="w-full text-left"
                  whileHover={{ y: -4 }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  <div className="aspect-[4/5] rounded-[1.8rem] overflow-hidden border border-white/10 bg-zinc-900 relative">
                    <img src={item.thumbnail_url || fallbackImage} alt={item.title || 'release'} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3">
                      <p className="text-white font-bold text-lg leading-tight line-clamp-2">{item.title || 'Untitled Asset'}</p>
                      <p className="text-zinc-300 text-[10px] uppercase tracking-[0.22em] mt-1">{item.artist_name || 'Sovereign Creator'}</p>
                    </div>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-black tracking-tight">Popular Artists</h2>
            <p className="text-zinc-500 text-xs uppercase tracking-[0.25em] font-mono">Recent Sales Glow</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            {popularArtists.map((artist) => (
              <button
                key={artist.id}
                onClick={() => onSelectCreator?.(artist)}
                className="text-center"
              >
                <div className={`w-24 h-24 mx-auto rounded-full overflow-hidden border ${artist.recentSale ? 'border-emerald-300 shadow-[0_0_35px_rgba(16,185,129,0.35)]' : 'border-white/15'} transition-all`}>
                  <img src={artist.avatar || fallbackImage} alt={artist.name} className="w-full h-full object-cover" />
                </div>
                <p className="mt-3 text-sm font-semibold text-white truncate">{artist.name}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">{artist.sales} sales</p>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-black tracking-tight">Trending Now</h2>
            <div className="flex items-center gap-2 text-orange-300 text-xs uppercase tracking-[0.25em] font-mono"><Flame size={14} /> High Traffic</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7">
            <AnimatePresence mode="popLayout">
              {trendingNow.map((item) => (
                <motion.article
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  layoutId={`asset-card-${item.id}`}
                  className="group rounded-[2rem] border border-white/10 bg-zinc-900/40 overflow-hidden"
                  whileHover={{ y: -6 }}
                >
                  <button onClick={() => setSelectedAsset(item)} className="w-full text-left">
                    <div className="aspect-square relative">
                      <img src={item.thumbnail_url || fallbackImage} className="w-full h-full object-cover" alt={item.title || 'asset'} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                      {userVault.includes(item.id) && (
                        <div className="absolute top-4 left-4 p-2 bg-indigo-500 rounded-xl shadow-lg">
                          <ShieldCheck size={16} />
                        </div>
                      )}
                      <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/70 border border-white/10 rounded-xl text-xs font-black">
                        ${typeof item.price_current === 'number' && item.price_current != null ? item.price_current.toFixed(2) : '0.00'}
                      </div>
                    </div>
                  </button>

                  <div className="p-4">
                    <button onClick={() => onSelectCreator?.({ id: item.creatorAddress || item.creator_address || item.artist_name, name: item.artist_name || 'Sovereign Creator', avatar: item.thumbnail_url || fallbackImage })} className="text-zinc-400 text-xs uppercase tracking-[0.2em] hover:text-indigo-300 transition">
                      {item.artist_name || 'Sovereign Creator'}
                    </button>
                    <h3 className="font-bold text-xl mt-2">{item.title || 'Untitled Asset'}</h3>
                    <button
                      onClick={() => onDirectBuy?.(item)}
                      disabled={userVault.includes(item.id)}
                      className="mt-4 w-full min-h-11 py-2 rounded-xl border border-indigo-400/40 text-indigo-200 text-xs uppercase tracking-[0.22em] hover:bg-indigo-500 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {userVault.includes(item.id) ? 'Owned' : 'Direct Buy'}
                    </button>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          </div>
        </section>
      </div>
    </section>
  );
}
