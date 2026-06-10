import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ink-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="p-4 lg:p-6 max-w-[1600px] mx-auto animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
