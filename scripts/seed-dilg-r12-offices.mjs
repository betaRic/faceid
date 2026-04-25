import { loadRepoEnv } from './lib/load-local-env.mjs'
import { getAdminDb } from './lib/firebase-admin-client.mjs'

loadRepoEnv()

const REGIONAL_DIVISIONS = [
  { id: 'ord',      shortName: 'ORD',      name: 'Office of the Regional Director',                      headName: 'SAMUEL A. CAMAGANACAN, CE',          headPosition: 'OIC-Assistant Regional Director' },
  { id: 'lgcdd',    shortName: 'LGCDD',    name: 'Local Government Capability and Development Division', headName: 'MARY ANN T. TRASPE',                  headPosition: 'Division Chief / LGOO VII' },
  { id: 'lgmed',    shortName: 'LGMED',    name: 'Local Government Modernization and Empowerment Division', headName: 'IAN JON S. CLEMENTE',              headPosition: 'Division Chief / LGOO VII' },
  { id: 'fad',      shortName: 'FAD',      name: 'Finance and Administrative Division',                  headName: 'DENNIS T. SUCOL, MPA',                headPosition: 'Chief Administrative Officer' },
  { id: 'legal',    shortName: 'LEGAL',    name: 'Legal Unit',                                           headName: 'ATTY. JANE S. TORREON',               headPosition: 'Attorney IV / Legal Officer' },
  { id: 'planning', shortName: 'PLAN',     name: 'Planning Unit',                                        headName: 'KAREN GRACE A. MOHINOG',              headPosition: 'Planning Officer III' },
  { id: 'info',     shortName: 'INFO',     name: 'Information Office Unit',                              headName: 'JON LEO J. LICAYAN',                  headPosition: 'Chief of Staff / Information Officer Designate' },
  { id: 'rictu',    shortName: 'RICTU',    name: 'Regional ICT Unit',                                    headName: 'CHRISTIAN MARK A. PATOSA',            headPosition: 'Administrative Officer V' },
  { id: 'pdmu',     shortName: 'PDMU',     name: 'Project Development and Monitoring Unit',              headName: 'ENGR. HERMINIA S. ONTOY',             headPosition: 'Local Government Operation Officer VI' },
]

const DEFAULT_WORK_POLICY = {
  schedule: 'Mon-Fri, 8:00 AM to 5:00 PM',
  workingDays: [1, 2, 3, 4, 5],
  wfhDays: [],
  morningIn: '08:00',
  morningOut: '12:00',
  afternoonIn: '13:00',
  afternoonOut: '17:00',
  gracePeriodMinutes: 10,
  checkInCooldownMinutes: 30,
  checkOutCooldownMinutes: 5,
}

const PLACEHOLDER_GPS = { latitude: 0, longitude: 0, radiusMeters: 150 }

const OFFICES = [
  {
    id: 'dilg-r12',
    code: 'R12',
    name: 'DILG Region 12 Regional Office',
    shortName: 'DILG R12',
    officeType: 'Regional Office',
    location: 'Regional Government Center, Brgy. Carpenter Hill, Koronadal City',
    provinceOrCity: 'South Cotabato',
    headName: 'ATTY. ROCHELLE D. MAHINAY-SERO, CESO III',
    headPosition: 'Regional Director',
    divisions: REGIONAL_DIVISIONS,
  },
  {
    id: 'dilg-south-cotabato',
    code: 'SC',
    name: 'DILG South Cotabato',
    shortName: 'DILG-SC',
    officeType: 'Provincial Office',
    location: 'DILG Provincial Office, South Cotabato',
    provinceOrCity: 'South Cotabato',
    headName: 'HAYD-ALI S. SUWAIB',
    headPosition: 'Provincial Director',
  },
  {
    id: 'dilg-cotabato',
    code: 'COT',
    name: 'DILG Cotabato',
    shortName: 'DILG-COT',
    officeType: 'Provincial Office',
    location: 'DILG Provincial Office, Cotabato',
    provinceOrCity: 'Cotabato',
    headName: 'INECITA C. KIONISALA',
    headPosition: 'Provincial Director',
  },
  {
    id: 'dilg-sultan-kudarat',
    code: 'SK',
    name: 'DILG Sultan Kudarat',
    shortName: 'DILG-SK',
    officeType: 'Provincial Office',
    location: 'DILG Provincial Office, Sultan Kudarat',
    provinceOrCity: 'Sultan Kudarat',
    headName: 'ALEX NATHAN C. GARCIA',
    headPosition: 'Provincial Director',
  },
  {
    id: 'dilg-sarangani',
    code: 'SAR',
    name: 'DILG Sarangani',
    shortName: 'DILG-SAR',
    officeType: 'Provincial Office',
    location: 'DILG Provincial Office, Sarangani',
    provinceOrCity: 'Sarangani',
    headName: 'RILIMIN H. SANDOVAL',
    headPosition: 'Provincial Director',
  },
  {
    id: 'dilg-general-santos',
    code: 'GSC',
    name: 'DILG General Santos',
    shortName: 'DILG-GSC',
    officeType: 'HUC Office',
    location: 'DILG City Office, General Santos City',
    provinceOrCity: 'General Santos City',
    headName: 'MARIA THERESA D. BAUTISTA',
    headPosition: 'City Director / LGOO VII',
  },
]

const db = getAdminDb()
const created = []
const updated = []

for (const office of OFFICES) {
  const ref = db.collection('offices').doc(office.id)
  const snapshot = await ref.get()

  const payload = {
    id: office.id,
    code: office.code,
    name: office.name,
    shortName: office.shortName,
    officeType: office.officeType,
    location: office.location,
    provinceOrCity: office.provinceOrCity,
    headName: office.headName,
    headPosition: office.headPosition,
    divisions: Array.isArray(office.divisions) ? office.divisions : [],
    wifiSsid: [],
    status: 'active',
    employees: 0,
    gps: PLACEHOLDER_GPS,
    workPolicy: DEFAULT_WORK_POLICY,
    updatedAt: new Date(),
  }

  if (!snapshot.exists) {
    payload.createdAt = new Date()
    await ref.set(payload)
    created.push(office.id)
  } else {
    // Idempotent merge — preserves whatever the admin has already customized
    // (GPS coords, schedule, wifi) while pushing the latest head/division data.
    await ref.set(
      {
        ...payload,
        gps: snapshot.data()?.gps || PLACEHOLDER_GPS,
        workPolicy: snapshot.data()?.workPolicy || DEFAULT_WORK_POLICY,
        wifiSsid: snapshot.data()?.wifiSsid || [],
      },
      { merge: true },
    )
    updated.push(office.id)
  }
}

console.log(JSON.stringify({
  ok: true,
  created,
  updated,
  total: OFFICES.length,
  note: 'Open the admin office editor to set real GPS coords for each office before any check-in will work.',
}, null, 2))
