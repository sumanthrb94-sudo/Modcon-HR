import { useEffect, useState } from 'react';
import { LogIn, LogOut, MapPin, Loader2, Monitor, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardHeader, Badge, Button, statusTone } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  getCurrentCoords,
  isOnSite,
  distanceMeters,
  formatDistance,
  OFFICE_LOCATION,
  type Coords,
} from '@/lib/geo';
import type { AttendanceStatus } from '@/types';

interface SelfRecord {
  date: string; // ISO date
  status: Extract<AttendanceStatus, 'Present' | 'Work From Home'>;
  checkIn: string; // HH:mm
  checkOut: string | null; // HH:mm
  workedHours: number;
  onSite: boolean;
  distanceMeters: number;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function hoursBetween(checkIn: string, checkOut: string): number {
  const [inH, inM] = checkIn.split(':').map(Number);
  const [outH, outM] = checkOut.split(':').map(Number);
  const mins = outH * 60 + outM - (inH * 60 + inM);
  return Math.max(0, Math.round((mins / 60) * 10) / 10);
}

function storageKey(email: string): string {
  return `modcon:self-attendance:${email.toLowerCase()}`;
}

export function SelfCheckIn() {
  const { profile } = useAuth();
  const email = profile?.email ?? '';

  const [record, setRecord] = useState<SelfRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Load any persisted record for today from localStorage.
  useEffect(() => {
    if (!email) return;
    try {
      const raw = window.localStorage.getItem(storageKey(email));
      if (!raw) {
        setRecord(null);
        return;
      }
      const parsed = JSON.parse(raw) as SelfRecord;
      setRecord(parsed.date === todayISO() ? parsed : null);
    } catch {
      setRecord(null);
    }
  }, [email]);

  function persist(next: SelfRecord | null) {
    setRecord(next);
    if (!email) return;
    try {
      if (next) window.localStorage.setItem(storageKey(email), JSON.stringify(next));
      else window.localStorage.removeItem(storageKey(email));
    } catch {
      // localStorage unavailable (private mode) — keep in-memory state only.
    }
  }

  async function handleCheckIn() {
    setError('');
    setBusy(true);
    try {
      const coords: Coords = await getCurrentCoords();
      const onSite = isOnSite(coords);
      const dist = distanceMeters(coords, OFFICE_LOCATION);
      persist({
        date: todayISO(),
        status: onSite ? 'Present' : 'Work From Home',
        checkIn: nowHHmm(),
        checkOut: null,
        workedHours: 0,
        onSite,
        distanceMeters: dist,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check in.');
    } finally {
      setBusy(false);
    }
  }

  function handleCheckOut() {
    if (!record || record.checkOut) return;
    const checkOut = nowHHmm();
    persist({
      ...record,
      checkOut,
      workedHours: hoursBetween(record.checkIn, checkOut),
    });
  }

  const checkedIn = record !== null;
  const checkedOut = record?.checkOut != null;

  return (
    <Card>
      <CardHeader
        title="My Attendance"
        subtitle="Check in with your location — on-site marks you Present, elsewhere marks Work From Home."
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ' +
              (!checkedIn
                ? 'bg-ink-100 text-ink-400'
                : record?.onSite
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-blue-50 text-blue-600')
            }
          >
            {!checkedIn ? (
              <MapPin size={20} />
            ) : record?.onSite ? (
              <CheckCircle2 size={20} />
            ) : (
              <Monitor size={20} />
            )}
          </div>
          <div>
            {!checkedIn ? (
              <p className="text-sm font-medium text-ink-700">You haven't checked in today.</p>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(record!.status)} dot>
                    {record!.status}
                  </Badge>
                  <span className="text-xs text-ink-500">
                    {record!.onSite ? 'On-site' : 'Off-site'} ·{' '}
                    {formatDistance(record!.distanceMeters)} from office
                  </span>
                </div>
                <p className="text-sm text-ink-600">
                  In <span className="font-semibold text-ink-900">{record!.checkIn}</span>
                  {record!.checkOut ? (
                    <>
                      {' · '}Out <span className="font-semibold text-ink-900">{record!.checkOut}</span>
                      {' · '}
                      <span className="font-semibold text-ink-900">{record!.workedHours.toFixed(1)}h</span> worked
                    </>
                  ) : (
                    <span className="text-ink-400"> · not checked out</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!checkedIn ? (
            <Button variant="primary" icon={busy ? <Loader2 className="animate-spin" size={16} /> : <LogIn size={16} />} onClick={handleCheckIn} disabled={busy}>
              {busy ? 'Locating…' : 'Check in'}
            </Button>
          ) : (
            <Button
              variant={checkedOut ? 'secondary' : 'primary'}
              icon={<LogOut size={16} />}
              onClick={handleCheckOut}
              disabled={checkedOut}
            >
              {checkedOut ? 'Checked out' : 'Check out'}
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      ) : null}
    </Card>
  );
}
