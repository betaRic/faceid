import { REGION12_OFFICES } from './offices'

const roles = [
  {
    id: 'regional-admin',
    title: 'Regional Admin',
    scope: 'Can manage all offices, employee transfers, WFH rules, holidays, and audit reports.',
  },
  {
    id: 'office-admin',
    title: 'Office Admin',
    scope: 'Can manage assigned office GPS radius, schedules, registration, WFH overrides, and attendance review.',
  },
  {
    id: 'employee',
    title: 'Employee',
    scope: 'Can clock in/out, view assigned office, and follow office-level WFH rules on mobile.',
  },
]

const featureCards = [
  {
    title: 'Single Office Assignment',
    body: 'Each employee belongs to one office only. Admins can transfer an employee to another office without recreating the account.',
  },
  {
    title: 'Strict GPS Blocking',
    body: 'Outside-radius attendance is blocked on normal office days. The only bypass is when the assigned office is on WFH for that day.',
  },
  {
    title: 'Office-Level WFH Rules',
    body: 'WFH is managed per office, not per employee. This keeps policy consistent for provincial, regional, and HUC offices.',
  },
  {
    title: 'Automatic Registration Capture',
    body: 'Registration should auto-detect the face, then ask only for employee name and office assignment so the record aligns with the organization structure.',
  },
]

const buildFlow = [
  {
    stage: 'Client',
    title: 'Employee mobile app',
    points: [
      'Loads assigned office, schedule, and whether today is an on-site or WFH day.',
      'Requests camera and GPS only when the employee starts attendance.',
      'Runs face capture on device to keep the experience fast on mobile.',
    ],
  },
  {
    stage: 'Server',
    title: 'Attendance validation API',
    points: [
      'Confirms the employee assignment and office policy for the current day.',
      'Blocks outside-radius attendance when the office is not on WFH.',
      'Accepts WFH attendance only when the office rule allows it for that date.',
    ],
  },
  {
    stage: 'Storage',
    title: 'Audit-ready records',
    points: [
      'Stores employee office assignment, geofence result, attendance mode, and recognition confidence.',
      'Stores office policy changes and transfer history separately from attendance logs.',
      'Keeps mobile-friendly read models for dashboard cards and daily approvals.',
    ],
  },
]

const sampleEmployees = [
  {
    id: 'emp-001',
    name: 'Maria Teresa Santos',
    office: 'South Cotabato Provincial Office',
    status: 'On-site allowed',
    shift: '8:00 AM - 5:00 PM',
    todayRule: 'Assigned to one office only',
  },
  {
    id: 'emp-002',
    name: 'Jayson Dela Cruz',
    office: 'General Santos City Office',
    status: 'WFH active',
    shift: '8:00 AM - 5:00 PM',
    todayRule: 'Office-level WFH rule applies today',
  },
  {
    id: 'emp-003',
    name: 'Amina Macasalong',
    office: 'Cotabato Provincial Office',
    status: 'Blocked outside radius',
    shift: '7:30 AM - 4:30 PM',
    todayRule: 'Outside geofence blocked unless office is on WFH',
  },
]

export function getRegion12Blueprint() {
  const totalEmployees = REGION12_OFFICES.reduce((sum, office) => sum + office.employees, 0)

  return {
    generatedAt: '2026-04-08',
    organization: {
      name: 'Department of the Interior and Local Government Region XII',
      coverage: 'South Cotabato, Cotabato, Sarangani, and General Santos City',
    },
    totals: {
      offices: REGION12_OFFICES.length,
      employees: totalEmployees,
      gpsEnabledOffices: REGION12_OFFICES.length,
      officeTypes: 3,
    },
    offices: REGION12_OFFICES,
    roles,
    featureCards,
    buildFlow,
    sampleEmployees,
  }
}
