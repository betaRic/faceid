import {
  ArrowLeft,
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  Building2,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileText,
  House,
  Landmark,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  Monitor,
  Moon,
  Pencil,
  Plus,
  ScanFace,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react'

const icons = {
  'arrow-left': ArrowLeft,
  'arrow-down': ArrowDown,
  'arrow-left-right': ArrowLeftRight,
  'arrow-right': ArrowRight,
  building: Building2,
  attendance: CalendarCheck,
  check: Check,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  alert: CircleAlert,
  clock: Clock3,
  download: Download,
  report: FileText,
  home: House,
  agency: Landmark,
  dashboard: LayoutDashboard,
  loading: LoaderCircle,
  logout: LogOut,
  location: MapPin,
  menu: Menu,
  monitor: Monitor,
  moon: Moon,
  edit: Pencil,
  add: Plus,
  scan: ScanFace,
  search: Search,
  settings: Settings,
  security: ShieldCheck,
  filters: SlidersHorizontal,
  sun: Sun,
  delete: Trash2,
  user: User,
  'user-add': UserPlus,
  employees: Users,
  close: X,
}

export function Icon({ name, label, size = 18, strokeWidth = 1.8, ...props }) {
  const Component = icons[name]

  if (!Component) {
    throw new Error(`Unknown icon: ${name}`)
  }

  return (
    <Component
      aria-hidden={label ? undefined : true}
      aria-label={label}
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  )
}
