// A second hard-coded copy of the India 2026 holiday calendar lived here,
// exported and imported by nothing. It was the more dangerous of the two: not
// gated by `isMockDataCleared()` the way `announcements` below it is, so any
// page that had ever imported it would have shown those ten days to every
// organisation, including ones created later in another country. The
// organisation's calendar has one home — `getHolidayDirectory()` in
// src/data/holidays.ts, which reads what the organisation declared and returns
// nothing when it has declared nothing.
import type { Announcement } from '@/types';
import { isMockDataCleared } from '@/lib/mockDataFlag';

export const announcements: Announcement[] = isMockDataCleared() ? [] : [
  {
    id: 'a1',
    title: 'Q2 All-Hands Meeting — June 18',
    body: 'Join us for the quarterly all-hands where leadership will share progress on our Series B roadmap, product wins, and the new hybrid work policy. Lunch will be catered for in-office teams.',
    category: 'Event',
    date: '2026-06-08',
    author: 'Ananya Reddy',
  },
  {
    id: 'a2',
    title: 'Updated Hybrid Work Policy',
    body: 'Starting July, all teams move to a 3-day in-office model (Tue–Thu). Remote-first roles remain unchanged. Please review the full policy on the People portal.',
    category: 'Policy',
    date: '2026-06-05',
    author: 'Ritu Bansal',
  },
  {
    id: 'a4',
    title: 'Health Insurance Renewal',
    body: 'Our group health insurance has been renewed with enhanced coverage including OPD benefits and increased sum insured to ₹7L. Updated cards will be issued by end of June.',
    category: 'General',
    date: '2026-05-28',
    author: 'Priya Kapoor',
  },
];
