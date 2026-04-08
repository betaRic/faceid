import dynamic from 'next/dynamic'

const AdminLogin = dynamic(() => import('../../../components/AdminLogin'), {
  ssr: false,
})

export default function AdminLoginPage() {
  return <AdminLogin />
}
