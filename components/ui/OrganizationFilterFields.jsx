import { Field, Select } from './FormControls'

export function OrganizationFilterFields({ levels = [], onChange, className = '' }) {
  const visibleLevels = levels.filter((level) => (level.options?.length || 0) > 0 || Boolean(level.value))

  if (visibleLevels.length === 0) return null

  return (
    <div className={`contents ${className}`}>
      {visibleLevels.map((level) => {
        const controlId = `organization-filter-${level.id}`
        return (
          <Field htmlFor={controlId} key={level.id} label={level.label}>
            <Select
              disabled={level.disabled}
              id={controlId}
              onChange={(event) => onChange?.(level.id, event.target.value)}
              value={level.value ?? ''}
            >
              <option value={level.emptyValue ?? ''}>{level.placeholder || `All ${level.label.toLowerCase()}s`}</option>
              {(level.options || []).map((option) => {
                const value = typeof option === 'string' ? option : option.value
                const label = typeof option === 'string' ? option : option.label
                return <option key={value} value={value}>{label}</option>
              })}
            </Select>
          </Field>
        )
      })}
    </div>
  )
}
