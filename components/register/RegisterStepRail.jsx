import { WizardStep } from '@/components/shared/ui'

export default function RegisterStepRail({ steps, activeStep, stepIndex }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-4 md:overflow-visible md:pb-0">
      {steps.map((item, idx) => (
        <div key={item.id} className="min-w-[11.5rem] md:min-w-0">
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
