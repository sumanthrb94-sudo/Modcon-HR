import { useState, useMemo } from 'react';
import {
  TicketCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  MessageSquare,
  Send,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  statusTone,
  Button,
  PageHeader,
  StatCard,
  Table,
  type Column,
  Tabs,
  Modal,
  SearchInput,
  Select,
} from '@/components/ui';
import { tickets as initialTickets, ticketCategories } from '@/data/helpdesk';
import { getEmployeeName } from '@/data/employees';
import type { Ticket, TicketStatus, TicketPriority } from '@/types';
import { timeAgo, formatDate } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Priority helpers
// ---------------------------------------------------------------------------

type PriorityTone = 'red' | 'amber' | 'blue' | 'gray';

function priorityTone(p: TicketPriority): PriorityTone {
  if (p === 'Urgent') return 'red';
  if (p === 'High') return 'amber';
  if (p === 'Medium') return 'blue';
  return 'gray';
}

// ---------------------------------------------------------------------------
// Mock conversation messages for ticket detail
// ---------------------------------------------------------------------------

interface ConvoMessage {
  author: string;
  isAgent: boolean;
  text: string;
  time: string;
}

function mockConvo(ticket: Ticket): ConvoMessage[] {
  const raiser = getEmployeeName(ticket.raisedById);
  return [
    {
      author: raiser,
      isAgent: false,
      text: ticket.subject,
      time: ticket.createdOn,
    },
    {
      author: ticket.assignedTo,
      isAgent: true,
      text: `Hi ${raiser.split(' ')[0]}, I've received your ticket and am looking into it now.`,
      time: new Date(new Date(ticket.createdOn).getTime() + 15 * 60 * 1000).toISOString(),
    },
    ...(ticket.status === 'Resolved' || ticket.status === 'Closed'
      ? [
          {
            author: ticket.assignedTo,
            isAgent: true,
            text: 'This has been resolved. Please let us know if you face any further issues.',
            time: new Date(new Date(ticket.createdOn).getTime() + 2 * 60 * 60 * 1000).toISOString(),
          },
        ]
      : []),
  ];
}

// ---------------------------------------------------------------------------
// Ticket Detail Modal
// ---------------------------------------------------------------------------

interface TicketDetailProps {
  ticket: Ticket;
  onClose: () => void;
  onStatusChange: (id: string, status: TicketStatus) => void;
}

function TicketDetailModal({ ticket, onClose, onStatusChange }: TicketDetailProps) {
  const [newStatus, setNewStatus] = useState<TicketStatus>(ticket.status);
  const convo = useMemo(() => mockConvo(ticket), [ticket]);
  const raiserName = getEmployeeName(ticket.raisedById);

  const statusOptions: { label: string; value: string }[] = [
    { label: 'Open', value: 'Open' },
    { label: 'In Progress', value: 'In Progress' },
    { label: 'Resolved', value: 'Resolved' },
    { label: 'Closed', value: 'Closed' },
  ];

  const handleSave = () => {
    onStatusChange(ticket.id, newStatus);
    onClose();
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`${ticket.ticketCode} · ${ticket.subject}`}
      subtitle={`${ticket.category} · Opened ${timeAgo(ticket.createdOn)}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleSave}>Save Status</Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Meta row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-ink-400 text-xs uppercase font-semibold mb-0.5">Raised By</p>
            <div className="flex items-center gap-1.5">
              <Avatar name={raiserName} size="xs" />
              <span className="text-ink-700">{raiserName}</span>
            </div>
          </div>
          <div>
            <p className="text-ink-400 text-xs uppercase font-semibold mb-0.5">Assigned To</p>
            <div className="flex items-center gap-1.5">
              <Avatar name={ticket.assignedTo} size="xs" />
              <span className="text-ink-700">{ticket.assignedTo}</span>
            </div>
          </div>
          <div>
            <p className="text-ink-400 text-xs uppercase font-semibold mb-0.5">Priority</p>
            <Badge tone={priorityTone(ticket.priority)}>{ticket.priority}</Badge>
          </div>
          <div>
            <p className="text-ink-400 text-xs uppercase font-semibold mb-0.5">Created</p>
            <span className="text-ink-600">{formatDate(ticket.createdOn)}</span>
          </div>
        </div>

        {/* Conversation timeline */}
        <div>
          <p className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-1.5">
            <MessageSquare size={15} />
            Conversation
          </p>
          <div className="space-y-3">
            {convo.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.isAgent ? 'flex-row-reverse' : ''}`}
              >
                <Avatar name={msg.author} size="sm" />
                <div
                  className={`max-w-[70%] rounded-xl px-3.5 py-2.5 text-sm ${
                    msg.isAgent
                      ? 'bg-brand-600 text-white'
                      : 'bg-ink-100 text-ink-800'
                  }`}
                >
                  <p className="font-semibold text-xs mb-1 opacity-75">{msg.author}</p>
                  <p>{msg.text}</p>
                  <p className={`text-xs mt-1 opacity-60`}>{timeAgo(msg.time)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status change */}
        <div className="border-t border-ink-100 pt-4">
          <p className="text-sm font-semibold text-ink-700 mb-2">Update Status</p>
          <Select
            value={newStatus}
            onChange={(v) => setNewStatus(v as TicketStatus)}
            options={statusOptions}
            className="w-48"
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Raise Ticket Modal
// ---------------------------------------------------------------------------

interface RaiseTicketProps {
  onClose: () => void;
  onSubmit: (ticket: Omit<Ticket, 'id' | 'ticketCode'>) => void;
}

const CATEGORY_OPTIONS_LIST = ticketCategories.map((c) => ({ label: c, value: c }));
const PRIORITY_OPTIONS_LIST: { label: string; value: string }[] = [
  { label: 'Low', value: 'Low' },
  { label: 'Medium', value: 'Medium' },
  { label: 'High', value: 'High' },
  { label: 'Urgent', value: 'Urgent' },
];

function RaiseTicketModal({ onClose, onSubmit }: RaiseTicketProps) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('IT');
  const [priority, setPriority] = useState('Medium');

  const handleSubmit = () => {
    if (!subject.trim()) return;
    onSubmit({
      subject: subject.trim(),
      category,
      raisedById: 'emp-001', // default to first employee for demo
      status: 'Open',
      priority: priority as TicketPriority,
      createdOn: new Date().toISOString(),
      assignedTo: 'Rahul Deshpande',
    });
    onClose();
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Raise a Ticket"
      subtitle="Submit a new support request. It will be assigned to the relevant team."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!subject.trim()}>
            <Send size={14} className="mr-1" />
            Submit Ticket
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-ink-700 block mb-1">
            Subject <span className="text-rose-500">*</span>
          </label>
          <input
            className="input w-full"
            placeholder="Briefly describe your issue…"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink-700 block mb-1">Category</label>
          <Select
            value={category}
            onChange={setCategory}
            options={CATEGORY_OPTIONS_LIST}
            className="w-full"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink-700 block mb-1">Priority</label>
          <Select
            value={priority}
            onChange={setPriority}
            options={PRIORITY_OPTIONS_LIST}
            className="w-full"
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// HelpdeskPage
// ---------------------------------------------------------------------------

export function HelpdeskPage() {
  const [ticketList, setTicketList] = useState<Ticket[]>(initialTickets);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showRaise, setShowRaise] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketCounter, setTicketCounter] = useState(57); // next ticket number

  // Stat card aggregates
  const stats = useMemo(() => {
    const open = ticketList.filter((t) => t.status === 'Open').length;
    const inProgress = ticketList.filter((t) => t.status === 'In Progress').length;
    const resolved = ticketList.filter((t) => t.status === 'Resolved').length;
    const urgent = ticketList.filter((t) => t.priority === 'Urgent').length;
    return { open, inProgress, resolved, urgent };
  }, [ticketList]);

  // Tab-filtered tickets
  const tabFilteredTickets = useMemo(() => {
    const statusMap: Record<string, TicketStatus | null> = {
      all: null,
      open: 'Open',
      inprogress: 'In Progress',
      resolved: 'Resolved',
    };
    const statusFilter = statusMap[tab];
    const q = search.toLowerCase();
    return ticketList.filter((t) => {
      const matchTab = !statusFilter || t.status === statusFilter;
      const matchSearch =
        !q ||
        t.subject.toLowerCase().includes(q) ||
        t.ticketCode.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        getEmployeeName(t.raisedById).toLowerCase().includes(q);
      return matchTab && matchSearch;
    });
  }, [ticketList, tab, search]);

  const handleRaise = (partial: Omit<Ticket, 'id' | 'ticketCode'>) => {
    const id = `tkt-new-${ticketCounter}`;
    const code = `HD-${2040 + ticketCounter}`;
    setTicketCounter((n) => n + 1);
    const newTicket: Ticket = { id, ticketCode: code, ...partial };
    setTicketList((prev) => [newTicket, ...prev]);
  };

  const handleStatusChange = (id: string, status: TicketStatus) => {
    setTicketList((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    setSelectedTicket((prev) => (prev?.id === id ? { ...prev, status } : prev));
  };

  const tabList = [
    { id: 'all', label: 'All', count: ticketList.length },
    { id: 'open', label: 'Open', count: stats.open },
    { id: 'inprogress', label: 'In Progress', count: stats.inProgress },
    { id: 'resolved', label: 'Resolved', count: stats.resolved },
  ];

  const columns: Column<Ticket>[] = [
    {
      key: 'ticket',
      header: 'Ticket',
      render: (row) => (
        <div>
          <p className="font-semibold text-ink-800">{row.subject}</p>
          <p className="text-xs text-ink-400">{row.ticketCode}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <Badge tone="gray">{row.category}</Badge>,
    },
    {
      key: 'raisedBy',
      header: 'Raised By',
      render: (row) => {
        const name = getEmployeeName(row.raisedById);
        return (
          <div className="flex items-center gap-2">
            <Avatar name={name} size="sm" />
            <span className="text-sm text-ink-700">{name}</span>
          </div>
        );
      },
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) => (
        <Badge tone={priorityTone(row.priority)} dot>
          {row.priority}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={statusTone(row.status)} dot>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (row) => (
        <span className="text-sm text-ink-400">{timeAgo(row.createdOn)}</span>
      ),
    },
    {
      key: 'assignedTo',
      header: 'Assigned To',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Avatar name={row.assignedTo} size="sm" />
          <span className="text-sm text-ink-600">{row.assignedTo}</span>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Helpdesk"
        subtitle="Track and manage internal support tickets across IT, HR, Facilities and Payroll."
        actions={
          <Button onClick={() => setShowRaise(true)}>
            <Plus size={16} className="mr-1" />
            Raise Ticket
          </Button>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Open"
          value={stats.open}
          icon={<TicketCheck size={22} />}
          iconClass="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="In Progress"
          value={stats.inProgress}
          icon={<Clock size={22} />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Resolved"
          value={stats.resolved}
          icon={<CheckCircle2 size={22} />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Urgent"
          value={stats.urgent}
          icon={<AlertTriangle size={22} />}
          iconClass="bg-rose-50 text-rose-600"
        />
      </div>

      {/* Tabs + Table */}
      <div className="card p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <Tabs tabs={tabList} active={tab} onChange={setTab} />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search tickets…"
            className="w-60 mb-1"
          />
        </div>
        <Table
          columns={columns}
          data={tabFilteredTickets}
          keyExtractor={(r) => r.id}
          onRowClick={(row) => setSelectedTicket(row)}
          emptyMessage="No tickets found."
        />
      </div>

      {/* Modals */}
      {showRaise && (
        <RaiseTicketModal onClose={() => setShowRaise(false)} onSubmit={handleRaise} />
      )}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
