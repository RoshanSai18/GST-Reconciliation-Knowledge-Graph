import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function AppLayout() {
  const { pathname } = useLocation()
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <main
          key={pathname}
          className="flex-1 overflow-y-auto p-6 animate-fade-in-up"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
