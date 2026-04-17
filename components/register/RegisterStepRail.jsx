import { WizardStep } from '@/components/shared/ui'

export default function RegisterStepRail({ steps, activeStep, stepIndex }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 xl:grid-cols-4">
      {steps.map((item, idx) => (
        <div key={item.id} className="min-w-[13.5rem] sm:min-w-0">
          <WizardStep
            active={item.id === activeStep}
            complete={idx < stepIndex}
            description={item.description}
            number={idx < stepIndex ? '✓' : item.number}
            title={item.title}
          />
        </div>
      ))}
    </div>
  )
}
