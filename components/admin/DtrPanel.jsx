'use client'

import { memo, useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { DtrGenerator } from '@/components/hr/Form48Dtr'
import { useHrSession } from '@/lib/hr/hooks'

function DtrPanelInner() {
  const { hrUser } = useHrSession()

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-0 flex-col gap-5 overflow-hidden rounded-[2rem] border border-black/5 bg-white/80 p-4 shadow-glow backdrop-blur sm:p-6"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35 }}
    >
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Reports</div>
        <h2 className="mt-1 font-display text-3xl font-bold text-ink">Daily Time Record</h2>
      </div>
      <DtrGenerator session={hrUser} />
    </motion.section>
  )
}

export const DtrPanel = memo(DtrPanelInner)