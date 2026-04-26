import { motion, AnimatePresence } from 'framer-motion'
import { X, Play, Pause, Volume2, Maximize2 } from 'lucide-react'
import { useState } from 'react'

const MediaPlayer = ({ media, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)

  if (!media) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className={`bg-zinc-900 rounded-lg overflow-hidden ${isFullscreen ? 'w-full h-full' : 'w-full max-w-4xl max-h-[90vh]'}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <div>
              <h2 className="text-xl font-bold text-white">{media.title || 'Untitled Media'}</h2>
              <p className="text-sm text-zinc-400">{media.description || 'No description available'}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Media Content */}
          <div className="relative bg-black aspect-video">
            {media.type === 'video' ? (
              <video
                className="w-full h-full object-contain"
                controls
                src={media.url}
              />
            ) : media.type === 'audio' ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-32 h-32 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Play className="w-16 h-16 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{media.title}</h3>
                  <audio
                    controls
                    className="w-full max-w-md"
                    src={media.url}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <img
                  src={media.url}
                  alt={media.title}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between p-4 border-t border-zinc-800">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-white" />
                ) : (
                  <Play className="w-5 h-5 text-white" />
                )}
              </button>
              
              <div className="flex items-center space-x-2">
                <Volume2 className="w-5 h-5 text-zinc-400" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-24"
                />
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-zinc-400">
                {media.views || 0} views
              </span>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <Maximize2 className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Metadata */}
          <div className="p-4 border-t border-zinc-800">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-zinc-400">Type:</span>
                <span className="ml-2 text-white capitalize">{media.type}</span>
              </div>
              <div>
                <span className="text-zinc-400">Duration:</span>
                <span className="ml-2 text-white">{media.duration || 'Unknown'}</span>
              </div>
              <div>
                <span className="text-zinc-400">Uploaded:</span>
                <span className="ml-2 text-white">
                  {media.createdAt?.toDate()?.toLocaleDateString() || 'Unknown'}
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Price:</span>
                <span className="ml-2 text-white">{media.price || 'Free'}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default MediaPlayer
