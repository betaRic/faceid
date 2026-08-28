import { Status } from '@/components/ui'

const labels = { active: 'Active', pending: 'Pending review', rejected: 'Rejected', inactive: 'Inactive' }
const tones = { active: 'active', pending: 'pending', rejected: 'rejected', inactive: 'neutral' }

export default function EmployeeLifecycleStatus({ status }) {
  const lifecycle = String(status || 'inactive').toLowerCase()
  return <Status tone={tones[lifecycle] || 'neutral'}>{labels[lifecycle] || lifecycle}</Status>
}
