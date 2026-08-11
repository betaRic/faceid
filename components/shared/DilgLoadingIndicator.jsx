"use client";

export default function DilgLoadingIndicator({ fullScreen = false, compact = false, label = "Loading…" }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={fullScreen ? "fixed inset-0 z-[9999] flex items-center justify-center bg-white/85 p-6 backdrop-blur-sm" : "flex items-center justify-center p-6"}
      role="status"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className={`dilg-loading-mark ${compact ? 'dilg-loading-mark--compact' : ''} motion-reduce:animate-none`} aria-hidden="true">
          <span className="dilg-loading-mark__stage">
            <img alt="" className="dilg-loading-mark__logo" src="/brand/dilg-logo.svg" />
          </span>
        </div>
        {label ? <p className="text-sm font-medium text-muted">{label}</p> : null}
      </div>
    </div>
  );
}
