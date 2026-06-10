import type { Announcement, Holiday } from '@/types';

export const holidays: Holiday[] = [
  { id: 'h1', name: 'Republic Day', date: '2026-01-26', type: 'National' },
  { id: 'h2', name: 'Holi', date: '2026-03-04', type: 'National' },
  { id: 'h3', name: 'Good Friday', date: '2026-04-03', type: 'Optional' },
  { id: 'h4', name: 'Eid al-Fitr', date: '2026-03-21', type: 'Optional' },
  { id: 'h5', name: 'Independence Day', date: '2026-08-15', type: 'National' },
  { id: 'h6', name: 'Ganesh Chaturthi', date: '2026-09-14', type: 'Regional' },
  { id: 'h7', name: 'Gandhi Jayanti', date: '2026-10-02', type: 'National' },
  { id: 'h8', name: 'Dussehra', date: '2026-10-20', type: 'Regional' },
  { id: 'h9', name: 'Diwali', date: '2026-11-08', type: 'National' },
  { id: 'h10', name: 'Christmas', date: '2026-12-25', type: 'National' },
];

export const announcements: Announcement[] = [
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
    id: 'a3',
    title: 'Welcome our new joiners! 🎉',
    body: 'Please give a warm welcome to Ishaan Gupta (Engineering) who joined us this month. Say hello on Slack!',
    category: 'Celebration',
    date: '2026-06-02',
    author: 'Sara Khan',
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
