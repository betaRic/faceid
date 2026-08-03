'use client'

export default function BrandMark({ compact = false, className = '', inverted = false }) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <div className={`relative shrink-0 overflow-hidden rounded-full shadow-md ring-2 ring-white/80 ${compact ? 'h-7 w-7' : 'h-10 w-10'}`}>
        <img
          alt="DILG Region XII"
          className="h-full w-full object-contain"
          height={192}
          src="/veriface-icon-192.png"
          width={192}
        />
      </div>
      <div className="min-w-0">
        <div className={`text-2xs font-semibold uppercase tracking-widest ${inverted ? 'text-sky/80' : 'text-amber'}`}>
          DILG Region XII
        </div>
        <div className={`font-bold leading-tight ${compact ? 'text-lg' : 'text-xl'} ${inverted ? 'text-white' : 'text-navy'}`}>
          VeriFace
        </div>
      </div>
    </div>
  )
}

