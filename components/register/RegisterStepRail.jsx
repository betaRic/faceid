import { Icon } from '@/components/ui'

export default function RegisterStepRail({ steps, activeStep, stepIndex }) {
  const progress = steps.length > 1 ? (stepIndex / (steps.length - 1)) * 100 : 0

  return (
    <div className="relative">
      <div aria-hidden="true" className="absolute left-5 right-5 top-4 h-[3px] rounded-full bg-line">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <ol className="relative grid grid-cols-4 gap-2">
        {steps.map((item, index) => {
          const complete = index < stepIndex
          const active = item.id === activeStep
          return (
            <li aria-current={active ? 'step' : undefined} className="min-w-0 text-center" key={item.id}>
              <span className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${complete || active ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-surface text-secondary'}`}>
                {complete ? <Icon name="check" size={15} /> : item.number}
              </span>
              <span className={`mt-2 block text-xs font-medium sm:text-sm ${active ? 'text-primary' : 'text-secondary'}`}>{item.title}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
