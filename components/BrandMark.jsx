'use client'

import Image from 'next/image'

export default function BrandMark({ compact = false, className = '', inverted = false }) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <div className={`relative overflow-hidden rounded-full shadow-md ring-2 ring-white/80 ${compact ? 'h-9 w-9' : 'h-12 w-12'}`}>
        <Image
          alt="DILG Region XII"
          className="object-cover"
          fill
          priority
          sizes={compact ? '36px' : '48px'}
          src="/brand/dilg-logo.svg"
        />
      </div>
      <div className="min-w-0">
        <div className={`text-2xs font-semibold uppercase tracking-widest ${inverted ? 'text-sky/80' : 'text-amber'}`}>
          DILG Region XII
        </div>
        <div className={`font-bold leading-tight ${compact ? 'text-lg' : 'text-xl'} ${inverted ? 'text-white' : 'text-navy'}`}>
          FaceAttend
        </div>
      </div>
    </div>
  )
}

