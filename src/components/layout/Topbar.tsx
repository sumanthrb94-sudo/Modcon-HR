import { Bell, Menu, Plus, Search } from 'lucide-react';
import { Avatar } from '@/components/ui';

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/90 backdrop-blur px-4 lg:px-6">
      <button onClick={onMenuClick} className="lg:hidden rounded-lg p-2 text-ink-500 hover:bg-ink-100">
        <Menu size={20} />
      </button>

      {/* Search */}
      <div className="relative hidden sm:block w-full max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          placeholder="Search employees, requests, documents…"
          className="input pl-9 bg-ink-50 border-transparent focus:bg-white"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button className="hidden md:inline-flex btn-primary px-3 py-2 text-sm">
          <Plus size={16} />
          Quick Add
        </button>
        <button className="relative rounded-lg p-2 text-ink-500 hover:bg-ink-100">
          <Bell size={20} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>
        <div className="flex items-center gap-2.5 pl-2 ml-1 border-l border-ink-200">
          <Avatar name="Ananya Reddy" size="sm" />
          <div className="hidden md:block leading-tight">
            <p className="text-sm font-semibold text-ink-900">Ananya Reddy</p>
            <p className="text-[11px] text-ink-400">Head of People</p>
          </div>
        </div>
      </div>
    </header>
  );
}
