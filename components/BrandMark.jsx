'use client'

import Image from 'next/image'

export default function BrandMark({ compact = false, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <div className={`relative overflow-hidden rounded-full bg-white/90 shadow-sm ${compact ? 'h-10 w-10' : 'h-14 w-14'}`}>
        <Image
          alt="DILG Region XII"
          className="object-cover"
          fill
          priority
          sizes={compact ? '40px' : '56px'}
          src="/brand/dilg-logo.svg"
        />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">DILG Region XII</div>
        <div className={`font-display leading-none text-ink ${compact ? 'text-lg' : 'text-2xl'}`}>FaceAttend</div>
      </div>
    </div>
  )
}
