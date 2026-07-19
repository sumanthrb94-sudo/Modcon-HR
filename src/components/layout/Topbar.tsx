import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Search } from 'lucide-react';
import { Avatar, Button, NotificationsMenu, QuickAddMenu } from '@/components/ui';
import { navItems } from '@/lib/nav';
import { getEmployeeDirectory } from '@/data/employees';
import { useAuth } from '@/lib/auth';

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOutUser } = useAuth();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const searchRef = useRef<HTMLDivElement | null>(null);

  const searchableItems = useMemo(
    () => [
      ...navItems.map((item) => ({
        id: `nav-${item.path}`,
        label: item.label,
        subtitle: `${item.group} module`,
        path: item.path,
      })),
      ...getEmployeeDirectory().slice(0, 30).map((employee) => ({
        id: `emp-${employee.id}`,
        label: employee.fullName,
        subtitle: `${employee.designation} · ${employee.department}`,
        path: `/employees/${employee.id}`,
      })),
    ],
    [directoryRevision],
  );

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return searchableItems
      .filter((item) => item.label.toLowerCase().includes(term) || item.subtitle.toLowerCase().includes(term))
      .slice(0, 8);
  }, [query, searchableItems]);

  useEffect(() => {
    setOpen(false);
    setQuery('');
  }, [location.pathname]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!searchRef.current) return;
      if (!searchRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    function handleDirectoryChange() {
      setDirectoryRevision((value) => value + 1);
    }

    window.addEventListener('modcon-hr-directory-changed', handleDirectoryChange);
    return () => window.removeEventListener('modcon-hr-directory-changed', handleDirectoryChange);
  }, []);

  function goTo(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/90 backdrop-blur px-4 lg:px-6">
      <button onClick={onMenuClick} className="lg:hidden rounded-lg p-2 text-ink-500 hover:bg-ink-100">
        <Menu size={20} />
      </button>

      {/* Search */}
      <div className="relative hidden sm:block w-full max-w-md" ref={searchRef}>
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          value={query}
          placeholder="Search employees, requests, documents…"
          className="input pl-9 bg-ink-50 border-transparent focus:bg-white"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
            }
            if (event.key === 'Enter' && results.length > 0) {
              event.preventDefault();
              goTo(results[0].path);
            }
          }}
        />

        {open && query.trim() ? (
          <div className="absolute left-0 right-0 z-50 mt-2 rounded-xl border border-ink-100 bg-white p-1.5 shadow-card-hover">
            {results.length === 0 ? (
              <p className="px-2.5 py-2 text-sm text-ink-500">No matching results</p>
            ) : (
              results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-ink-50"
                  onClick={() => goTo(item.path)}
                >
                  <span className="block text-sm font-medium text-ink-800">{item.label}</span>
                  <span className="block text-xs text-ink-500">{item.subtitle}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {location.pathname !== '/' ? (
          <Button variant="secondary" size="sm" onClick={() => navigate('/')}>
            Dashboard
          </Button>
        ) : null}
        <QuickAddMenu className="hidden md:inline-flex" />
        <NotificationsMenu compact />
        <div className="flex items-center gap-2.5 pl-2 ml-1 border-l border-ink-200">
          <Avatar name={profile?.displayName || profile?.email || 'User'} size="sm" />
          <div className="hidden md:block leading-tight">
            <p className="text-sm font-semibold text-ink-900">{profile?.displayName || profile?.email}</p>
            <p className="text-[11px] text-ink-400">{profile?.role === 'admin' ? 'Administrator' : 'Employee'}</p>
          </div>
          <button
            type="button"
            onClick={() => signOutUser()}
            className="ml-1 rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-rose-600"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
