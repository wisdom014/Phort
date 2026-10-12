import React, { useEffect, useState } from 'react';
import { MediaAsset } from '../types';
import { motion } from 'motion/react';
import { useSettings } from '../lib/SettingsContext';

interface EditTagsModalProps {
  asset: MediaAsset | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedAsset: MediaAsset) => void;
}

export const EditTagsModal: React.FC<EditTagsModalProps> = ({
  asset,
  isOpen,
  onClose,
  onSave
}) => {
  // Hooks must run unconditionally on every render — the early return below has
  // to come AFTER them, or opening the modal changes the hook count and React
  // throws "rendered more hooks than during the previous render".
  const { settings } = useSettings();
  const [t1Tags, setT1Tags] = useState('');
  const [t2Tags, setT2Tags] = useState('');
  const [bucket, setBucket] = useState('');
  const [category, setCategory] = useState<MediaAsset['primaryCategory']>('human');
  const [confidence, setConfidence] = useState(0.9);

  // Re-sync the form whenever a different asset is opened.
  useEffect(() => {
    if (!asset) return;
    setT1Tags(asset.tier1Tags.map((t) => t.label).join(', '));
    setT2Tags(asset.tier2Tags.map((t) => t.label).join(', '));
    setBucket(asset.autoOrganizedBucket);
    setCategory(asset.primaryCategory);
    setConfidence(asset.aiConfidenceScore);
  }, [asset]);

  if (!isOpen || !asset) return null;

  const handleSave = () => {
    const updatedTier1 = t1Tags.split(',').map((s) => ({ label: s.trim().toUpperCase(), confidence: 0.95 })).filter((t) => t.label);
    const updatedTier2 = t2Tags.split(',').map((s) => ({ label: s.trim().toUpperCase(), confidence: 0.90 })).filter((t) => t.label);

    const updated: MediaAsset = {
      ...asset,
      primaryCategory: category,
      autoOrganizedBucket: bucket,
      aiConfidenceScore: confidence,
      tier1Tags: updatedTier1,
      tier2Tags: updatedTier2
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface-raised border border-hairline rounded-3xl w-full max-w-md p-6 shadow-panel space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-hairline">
          <div>
            <h3 className="font-['Geist'] text-lg font-bold text-ink">Edit details</h3>
            <p className="text-xs text-ink-faint font-mono-data truncate max-w-[280px]">
              {asset.fileName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-ink-faint hover:text-ink p-1 rounded-lg"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="space-y-4 text-xs font-mono-data">
          <div>
            <label className="text-ink-faint uppercase tracking-wider block mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MediaAsset['primaryCategory'])}
              className="w-full bg-surface border border-hairline rounded-xl px-3 py-2.5 text-ink focus:outline-none focus:border-accent"
            >
              <option value="human">People (portrait, group, candid)</option>
              <option value="nonhuman">Objects &amp; scenes (gear, detail, decor, landscape, venue)</option>
            </select>
          </div>

          <div>
            <label className="text-ink-faint uppercase tracking-wider block mb-1.5">
              Smart bucket
            </label>
            <input
              type="text"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              className="w-full bg-surface border border-hairline rounded-xl px-3 py-2.5 text-ink focus:outline-none focus:border-accent"
              placeholder="/People/Couples"
            />
          </div>

          <div>
            <label className="text-ink-faint uppercase tracking-wider block mb-1.5">
              Main tags (comma-separated)
            </label>
            <input
              type="text"
              value={t1Tags}
              onChange={(e) => setT1Tags(e.target.value)}
              className="w-full bg-surface border border-hairline rounded-xl px-3 py-2.5 text-ink focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-ink-faint uppercase tracking-wider block mb-1.5">
              Detail tags (comma-separated)
            </label>
            <input
              type="text"
              value={t2Tags}
              onChange={(e) => setT2Tags(e.target.value)}
              className="w-full bg-surface border border-hairline rounded-xl px-3 py-2.5 text-ink focus:outline-none focus:border-accent"
            />
          </div>

          {settings.showConfidence && (
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-ink-faint uppercase tracking-wider">Detection confidence</span>
                <span className="text-positive font-bold">{Math.round(confidence * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.0"
                step="0.01"
                value={confidence}
                onChange={(e) => setConfidence(parseFloat(e.target.value))}
                className="w-full accent-accent bg-surface h-1.5 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-hairline">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-surface border border-hairline hover:bg-surface-hover rounded-xl text-xs font-mono-data text-ink transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-mono-data font-bold transition-colors"
          >
            Save changes
          </button>
        </div>
      </motion.div>
    </div>
  );
};
