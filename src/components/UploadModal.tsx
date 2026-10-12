import React, { useState, useRef } from 'react';
import { MediaAsset } from '../types';
import { motion } from 'motion/react';
import { ingestFiles, IngestProgress } from '../lib/ingestionService';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (newAssets: MediaAsset[]) => void;
  targetProjectId: string;
  targetProjectName: string;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
  targetProjectId,
  targetProjectName
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStatus, setCurrentStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  if (!isOpen) return null;

  const stageLabel: Record<IngestProgress['stage'], string> = {
    uploading: 'Uploading to secure storage...',
    analyzing: 'Running on-device detection (human.js + YOLO ONNX) — mood, people & objects...',
    saving: 'Auto-routing into Smart Buckets...',
    done: 'Ingestion complete!',
    error: 'Ingestion error'
  };

  const runIngestion = async (files: File[]) => {
    setIsProcessing(true);
    setErrorMsg(null);
    setProgress(5);
    setCurrentStatus(`Preparing ${files.length} file${files.length > 1 ? 's' : ''}...`);

    try {
      const newAssets = await ingestFiles(
        files,
        { projectId: targetProjectId, projectName: targetProjectName, userId: user?.id },
        (p) => {
          setCurrentStatus(`${stageLabel[p.stage]} (${p.fileName})`);
          setProgress((prev) => Math.min(95, prev + 90 / (files.length * 3)));
        }
      );

      setProgress(100);
      setCurrentStatus('Ingestion complete!');
      setTimeout(() => {
        onUploadSuccess(newAssets);
        setIsProcessing(false);
        setProgress(0);
        onClose();
      }, 500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong during ingestion.');
      setIsProcessing(false);
    }
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      runIngestion(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      runIngestion(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface-raised border border-hairline rounded-3xl w-full max-w-lg p-6 shadow-panel space-y-6"
      >
        <div className="flex items-center justify-between pb-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-accent/20 rounded-xl text-accent">
              <span className="material-symbols-outlined text-xl">cloud_upload</span>
            </div>
            <div>
              <h3 className="font-['Geist'] text-lg font-bold text-ink">Ingest Media</h3>
              <p className="text-xs text-ink-faint font-mono-data">Local AI classifier</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-faint hover:text-ink p-1 rounded-lg"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {!isSupabaseConfigured && (
          <div className="text-[11px] font-mono-data text-caution bg-caution/10 border border-caution/30 rounded-xl px-3 py-2">
            Supabase env vars aren't set — running in local-only mode. Uploads won't persist across sessions.
          </div>
        )}

        {errorMsg && (
          <div className="text-[11px] font-mono-data text-critical bg-critical/10 border border-critical/30 rounded-xl px-3 py-2">
            {errorMsg}
          </div>
        )}

        {isProcessing ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center mx-auto text-accent animate-spin">
              <span className="material-symbols-outlined text-2xl">sync</span>
            </div>
            <div>
              <h4 className="font-['Geist'] text-sm sm:text-base font-bold text-ink px-2 break-words">{currentStatus}</h4>
              <p className="text-xs text-ink-faint font-mono-data mt-1">
                Batch analysis ({Math.round(progress)}% complete)
              </p>
            </div>
            <div className="w-full bg-surface h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-accent to-info h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? 'border-accent bg-accent/10 scale-102'
                : 'border-hairline bg-surface/60 hover:border-accent/50 hover:bg-surface'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.cr2,.cr3,.raf,.arw,.nef,.dng,.raw"
              className="hidden"
              onChange={handleFiles}
            />
            <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-2xl">add_photo_alternate</span>
            </div>
            <h4 className="font-['Geist'] text-sm font-semibold text-ink">
              Drag &amp; drop photos, videos, or RAW files here
            </h4>
            <p className="text-xs text-ink-faint font-mono-data mt-1">
              JPG/PNG/WebP and MP4/WebM/MOV get full live detection (one representative frame is
              analyzed for video). Canon CR3/CR2, Sony ARW, Fuji RAF, Nikon NEF, and DNG upload fine
              but skip live analysis and use the fallback classifier — browsers can't decode RAW.
            </p>
            <button className="mt-4 px-4 py-2 bg-surface-raised border border-hairline rounded-xl text-xs font-mono-data text-ink hover:bg-surface-hover transition-colors">
              Browse Local Drives
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px] font-mono-data text-ink-faint pt-2">
          <span className="truncate">Target Project: {targetProjectName}</span>
          <span>On-device AI (human.js + YOLO ONNX) — no API key, runs in-browser</span>
        </div>
      </motion.div>
    </div>
  );
};
