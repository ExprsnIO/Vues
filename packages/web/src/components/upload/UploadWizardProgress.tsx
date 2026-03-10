import { twMerge } from 'tailwind-merge';

interface Step {
  number: number;
  label: string;
  description: string;
}

const STEPS: Step[] = [
  { number: 0, label: 'Upload', description: 'Select video file' },
  { number: 1, label: 'Details', description: 'Add title & description' },
  { number: 2, label: 'Cover', description: 'Choose thumbnail' },
  { number: 3, label: 'Settings', description: 'Configure visibility' },
  { number: 4, label: 'Review', description: 'Review & publish' },
];

interface UploadWizardProgressProps {
  currentStep: number;
  completedSteps: number[];
  onStepClick?: (step: number) => void;
}

export function UploadWizardProgress({
  currentStep,
  completedSteps,
  onStepClick,
}: UploadWizardProgressProps) {
  return (
    <div className="w-full bg-zinc-900 border-b border-zinc-800 py-6 px-4 md:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Desktop: Horizontal stepper */}
        <div className="hidden md:block">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const isCompleted = completedSteps.includes(step.number);
              const isCurrent = currentStep === step.number;
              const isClickable = onStepClick && (isCompleted || step.number < currentStep);

              return (
                <div key={step.number} className="flex items-center flex-1">
                  {/* Step */}
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => isClickable && onStepClick?.(step.number)}
                      disabled={!isClickable}
                      className={twMerge(
                        'w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all',
                        isCurrent && 'bg-primary-500 text-white ring-4 ring-primary-500/20',
                        isCompleted && !isCurrent && 'bg-green-600 text-white',
                        !isCurrent && !isCompleted && 'bg-zinc-800 text-gray-400',
                        isClickable && 'cursor-pointer hover:scale-105'
                      )}
                    >
                      {isCompleted && !isCurrent ? (
                        <CheckIcon className="w-5 h-5" />
                      ) : (
                        step.number + 1
                      )}
                    </button>
                    <p
                      className={twMerge(
                        'mt-2 text-sm font-medium',
                        isCurrent && 'text-white',
                        !isCurrent && 'text-gray-400'
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                  </div>

                  {/* Connector line */}
                  {index < STEPS.length - 1 && (
                    <div
                      className={twMerge(
                        'flex-1 h-0.5 mx-4 transition-colors',
                        completedSteps.includes(step.number) ? 'bg-green-600' : 'bg-zinc-700'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile: Compact progress bar */}
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white font-semibold">
                Step {currentStep + 1} of {STEPS.length}
              </p>
              <p className="text-sm text-gray-400">{STEPS[currentStep].label}</p>
            </div>
            <div className="text-sm text-gray-500">
              {completedSteps.length}/{STEPS.length} completed
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 transition-all duration-300"
              style={{
                width: `${((currentStep + 1) / STEPS.length) * 100}%`,
              }}
            />
          </div>

          {/* Step dots */}
          <div className="flex justify-between mt-3">
            {STEPS.map((step) => (
              <button
                key={step.number}
                onClick={() => onStepClick?.(step.number)}
                disabled={!completedSteps.includes(step.number) && step.number > currentStep}
                className={twMerge(
                  'w-2 h-2 rounded-full transition-all',
                  currentStep === step.number && 'bg-primary-500 w-3 h-3',
                  completedSteps.includes(step.number) && currentStep !== step.number && 'bg-green-600',
                  !completedSteps.includes(step.number) && currentStep !== step.number && 'bg-zinc-700'
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
