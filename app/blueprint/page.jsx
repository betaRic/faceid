import WorkforceAttendanceSuite from '../../components/WorkforceAttendanceSuite'
import { getRegion12Blueprint } from '../../lib/region12-demo'

export default function BlueprintPage() {
  return <WorkforceAttendanceSuite initialData={getRegion12Blueprint()} />
}
