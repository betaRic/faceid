'use client'

export default function BrandMark({ compact = false, className = '', inverted = false }) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <div className={`shrink-0 overflow-hidden rounded-full ${compact ? 'h-8 w-8' : 'h-10 w-10'}`}>
        <img
          alt=""
          className="h-full w-full object-contain"
          height={192}
          src="/veriface-icon-192.png"
          width={192}
        />
      </div>
      <div className="min-w-0">
        <div className={`text-xs font-medium leading-tight ${inverted ? 'text-white/75' : 'text-secondary'}`}>
          DILG Region XII
        </div>
        <div className={`font-semibold leading-tight ${compact ? 'text-base' : 'text-xl'} ${inverted ? 'text-white' : 'text-primary'}`}>
          VeriFace
        </div>
      </div>
    </div>
  )
}

