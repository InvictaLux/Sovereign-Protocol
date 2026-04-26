import { motion } from 'framer-motion'
import { Play, Music, Image, Download, Heart, Share2, Eye } from 'lucide-react'
import { clsx } from 'clsx'

const Market = ({ marketplaceData, userLibrary, onMediaSelect }) => {
  const getTypeIcon = (type) => {
    switch (type) {
      case 'video':
        return <Play className="w-4 h-4" />
      case 'audio':
        return <Music className="w-4 h-4" />
      case 'image':
        return <Image className="w-4 h-4" />
      default:
        return <Play className="w-4 h-4" />
    }
  }

  const isInLibrary = (mediaId) => {
    return userLibrary.some(item => item.id === mediaId)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-white">Sovereign Marketplace</h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
          Discover and collect premium digital media from creators around the world
        </p>
        <div className="flex items-center justify-center space-x-8 text-sm text-zinc-400">
          <span>{marketplaceData.length} items available</span>
          <span>{userLibrary.length} in your library</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-center space-x-4 border-b border-zinc-800">
        {['All', 'Video', 'Audio', 'Image'].map((filter) => (
          <button
            key={filter}
            className={clsx(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2',
              filter === 'All'
                ? 'text-indigo-400 border-indigo-400'
                : 'text-zinc-400 border-transparent hover:text-white hover:border-zinc-600'
            )}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Media Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {marketplaceData.map((media, index) => (
          <motion.div
            key={media.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="bg-zinc-900 rounded-lg overflow-hidden hover:bg-zinc-800 transition-colors cursor-pointer group"
            onClick={() => onMediaSelect(media)}
          >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-black overflow-hidden">
              {media.type === 'image' ? (
                <img
                  src={media.thumbnail || media.url}
                  alt={media.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                  <div className="text-white text-center">
                    {getTypeIcon(media.type)}
                    <p className="text-xs mt-2 capitalize">{media.type}</p>
                  </div>
                </div>
              )}
              
              {/* Overlay */}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity duration-300 flex items-center justify-center">
                <Play className="w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>

              {/* Price Badge */}
              {media.price && (
                <div className="absolute top-2 right-2 bg-indigo-600 text-white text-xs px-2 py-1 rounded">
                  {media.price}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="p-4 space-y-2">
              <h3 className="font-semibold text-white truncate">
                {media.title || 'Untitled Media'}
              </h3>
              <p className="text-sm text-zinc-400 line-clamp-2">
                {media.description || 'No description available'}
              </p>
              
              {/* Metadata */}
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <div className="flex items-center space-x-3">
                  <span className="flex items-center space-x-1">
                    <Eye className="w-3 h-3" />
                    <span>{media.views || 0}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Heart className="w-3 h-3" />
                    <span>{media.likes || 0}</span>
                  </span>
                </div>
                <span>
                  {media.createdAt?.toDate()?.toLocaleDateString() || ''}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-2 pt-2">
                <button
                  className={clsx(
                    'flex-1 py-2 px-3 rounded text-xs font-medium transition-colors',
                    isInLibrary(media.id)
                      ? 'bg-zinc-700 text-zinc-300'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    // Handle library add/remove
                  }}
                >
                  {isInLibrary(media.id) ? 'In Library' : 'Add to Library'}
                </button>
                
                <button
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    // Handle share
                  }}
                >
                  <Share2 className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Empty State */}
      {marketplaceData.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Play className="w-8 h-8 text-zinc-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No media available</h3>
          <p className="text-zinc-400">Check back later for new content</p>
        </div>
      )}
    </div>
  )
}

export default Market
