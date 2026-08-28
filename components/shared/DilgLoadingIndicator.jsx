"use client";

import { LoadingState } from '@/components/ui'

export default function DilgLoadingIndicator({ fullScreen = false, compact = false, label = "Loading…" }) {
  return (
    <div
      className={fullScreen ? "fixed inset-0 z-[9999] flex items-center justify-center bg-white/85 p-6 backdrop-blur-sm" : "flex items-center justify-center p-6"}
    >
      <LoadingState className={compact ? 'text-xs' : ''} label={label || 'Loading…'} />
    </div>
  );
}
