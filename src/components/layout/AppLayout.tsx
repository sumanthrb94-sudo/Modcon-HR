import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SubscriptionBanner } from './SubscriptionBanner';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ink-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        {/* Above every page rather than on a billing screen nobody visits: a
            trial ending is the one piece of state whose cost of going unnoticed
            lands on the customer. It renders nothing for most of a trial. */}
        <SubscriptionBanner />
        <main className="p-4 lg:p-6 max-w-[1600px] mx-auto animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
