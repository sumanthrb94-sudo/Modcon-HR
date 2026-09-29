import { useState, useMemo } from 'react';
import {
  Phone,
  Mail,
  Calendar,
  Building2,
  Users,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Search,
  Filter,
  Trash2,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  Badge,
  Button,
  SearchInput,
  Select,
  EmptyState,
} from '@/components/ui';
import {
  useDemoRequests,
  type DemoRequest,
  getWhatsAppDemoLink,
} from '@/lib/demoRequests';

interface DemoRequestsAnalyticsPanelProps {
  onPreFillOrg?: (company: string, email: string) => void;
}

export default function DemoRequestsAnalyticsPanel({
  onPreFillOrg,
}: DemoRequestsAnalyticsPanelProps) {
  const { demoRequests, loading, updateStatus, deleteLead } = useDemoRequests();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Analytics aggregations
  const stats = useMemo(() => {
    const total = demoRequests.length;
    const newCount = demoRequests.filter((r) => r.status === 'New').length;
    const scheduled = demoRequests.filter(
      (r) => r.status === 'Demo Scheduled',
    ).length;
    const converted = demoRequests.filter((r) => r.status === 'Converted').length;

    // Team size breakdown
    const sizeMap: Record<string, number> = {};
    demoRequests.forEach((r) => {
      const s = r.teamSize || 'Unknown';
      sizeMap[s] = (sizeMap[s] || 0) + 1;
    });

    return { total, newCount, scheduled, converted, sizeMap };
  }, [demoRequests]);

  const filtered = useMemo(() => {
    return demoRequests.filter((r) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        r.fullName?.toLowerCase().includes(q) ||
        r.companyName?.toLowerCase().includes(q) ||
        r.workEmail?.toLowerCase().includes(q) ||
        r.phone?.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === 'All' || r.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [demoRequests, search, statusFilter]);

  function getStatusTone(status: DemoRequest['status']): 'amber' | 'blue' | 'green' | 'violet' | 'gray' {
    switch (status) {
      case 'New':
        return 'amber';
      case 'Contacted':
        return 'blue';
      case 'Demo Scheduled':
        return 'violet';
      case 'Converted':
        return 'green';
      default:
        return 'gray';
    }
  }

  return (
    <div className="space-y-6">
      {/* Header and KPI cards */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-display font-extrabold text-ink-900 tracking-tight flex items-center gap-2">
              <MessageSquare size={20} className="text-brand-600" />
              <span>Inbound Demo Requests & Form Analytics</span>
              <span className="text-xs font-mono font-bold bg-brand-600 text-white px-2 py-0.5 ml-2">
                SUPER ADMIN
              </span>
            </h2>
            <p className="text-xs text-ink-600 mt-0.5">
              Live inbound leads submitted via the public landing page demo booking form and direct hotline outreach.
            </p>
          </div>
        </div>

        {/* 4 Analytics KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-white border border-ink-300">
            <span className="text-[10px] font-mono uppercase text-ink-500 block mb-1">Total Submissions</span>
            <div className="text-2xl font-extrabold font-display text-ink-900">{stats.total}</div>
            <span className="text-[11px] text-ink-500 font-mono mt-1 block">Inbound inquiries</span>
          </div>

          <div className="p-4 bg-white border border-amber-400 bg-amber-50/20">
            <span className="text-[10px] font-mono uppercase text-amber-700 font-bold block mb-1">New / Action Required</span>
            <div className="text-2xl font-extrabold font-display text-amber-700">{stats.newCount}</div>
            <span className="text-[11px] text-amber-600 font-mono mt-1 block">Awaiting outreach</span>
          </div>

          <div className="p-4 bg-white border border-brand-500">
            <span className="text-[10px] font-mono uppercase text-brand-700 font-bold block mb-1">Demos Scheduled</span>
            <div className="text-2xl font-extrabold font-display text-brand-600">{stats.scheduled}</div>
            <span className="text-[11px] text-brand-600 font-mono mt-1 block">Presentations active</span>
          </div>

          <div className="p-4 bg-white border border-emerald-500 bg-emerald-50/20">
            <span className="text-[10px] font-mono uppercase text-emerald-800 font-bold block mb-1">Converted Tenants</span>
            <div className="text-2xl font-extrabold font-display text-emerald-700">{stats.converted}</div>
            <span className="text-[11px] text-emerald-700 font-mono mt-1 block">Provisioned into orgs</span>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <Card>
        <div className="p-4 border-b border-ink-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="w-full sm:w-72">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search leads by name, company, email, phone…"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-ink-600 font-medium">
              <Filter size={14} />
              <span>Status:</span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-ink-300 px-3 py-1.5 bg-white font-medium focus:outline-none focus:border-brand-600"
            >
              <option value="All">All Statuses ({stats.total})</option>
              <option value="New">New ({stats.newCount})</option>
              <option value="Contacted">Contacted</option>
              <option value="Demo Scheduled">Demo Scheduled ({stats.scheduled})</option>
              <option value="Converted">Converted ({stats.converted})</option>
              <option value="Disqualified">Disqualified</option>
            </select>
          </div>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="py-12 text-center text-xs text-ink-500 font-mono">
            Loading real-time demo leads…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12">
            <EmptyState
              title="No demo inquiries found"
              description={
                search || statusFilter !== 'All'
                  ? 'No submissions match your search or status filter.'
                  : 'Inbound demo requests submitted on the landing page will appear here instantly.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-ink-900 bg-ink-100 font-display font-extrabold uppercase tracking-wider text-[11px] text-ink-800">
                  <th className="py-3 px-4">Prospect & Company</th>
                  <th className="py-3 px-4">Contact Channels</th>
                  <th className="py-3 px-4">Team Size</th>
                  <th className="py-3 px-4">Notes / Slot</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {filtered.map((lead) => {
                  const whatsappUrl = `https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                    `Hello ${lead.fullName}, thank you for requesting a Modcon HR demo for ${lead.companyName}. When would be the best time for our enterprise team to walk you through the platform?`,
                  )}`;

                  return (
                    <tr key={lead.id} className="hover:bg-ink-50/60 transition-colors">
                      {/* Prospect & Company */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-bold text-ink-900 text-sm">
                          {lead.fullName}
                        </div>
                        <div className="flex items-center gap-1.5 text-ink-600 mt-0.5">
                          <Building2 size={13} className="text-ink-400" />
                          <span>{lead.companyName}</span>
                        </div>
                        {lead.createdAtIso && (
                          <div className="text-[10px] font-mono text-ink-400 mt-1">
                            {new Date(lead.createdAtIso).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </div>
                        )}
                      </td>

                      {/* Contact Channels */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="space-y-1">
                          <a
                            href={`tel:${lead.phone}`}
                            className="flex items-center gap-1.5 font-mono text-ink-800 hover:text-brand-600 font-medium"
                          >
                            <Phone size={12} className="text-brand-600" />
                            <span>{lead.phone}</span>
                          </a>

                          <a
                            href={`mailto:${lead.workEmail}`}
                            className="flex items-center gap-1.5 text-ink-600 hover:text-ink-900"
                          >
                            <Mail size={12} className="text-ink-400" />
                            <span>{lead.workEmail}</span>
                          </a>
                        </div>
                      </td>

                      {/* Team Size */}
                      <td className="py-3.5 px-4 align-top">
                        <span className="inline-block px-2 py-0.5 bg-ink-100 border border-ink-300 font-mono text-[11px] text-ink-800 font-medium">
                          {lead.teamSize || '10–49 seats'}
                        </span>
                      </td>

                      {/* Notes / Slot */}
                      <td className="py-3.5 px-4 align-top max-w-xs">
                        {lead.preferredSlot && (
                          <div className="font-mono text-[11px] text-brand-700 font-medium mb-1">
                            Slot: {lead.preferredSlot}
                          </div>
                        )}
                        <p className="text-ink-700 text-xs line-clamp-2">
                          {lead.message || 'Standard product demo requested via website.'}
                        </p>
                      </td>

                      {/* Status Selector */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="space-y-1.5">
                          <Badge tone={getStatusTone(lead.status)}>
                            {lead.status}
                          </Badge>
                          <select
                            value={lead.status}
                            onChange={(e) =>
                              lead.id &&
                              updateStatus(
                                lead.id,
                                e.target.value as DemoRequest['status'],
                              )
                            }
                            className="block text-[11px] border border-ink-300 bg-white px-2 py-1 text-ink-800 focus:outline-none focus:border-brand-600 font-sans"
                          >
                            <option value="New">Mark New</option>
                            <option value="Contacted">Mark Contacted</option>
                            <option value="Demo Scheduled">Mark Scheduled</option>
                            <option value="Converted">Mark Converted</option>
                            <option value="Disqualified">Mark Disqualified</option>
                          </select>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 align-top text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* WhatsApp CTA */}
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-700 text-white hover:bg-emerald-800 text-[11px] font-display font-extrabold uppercase tracking-wide transition-colors"
                            title="Chat with lead on WhatsApp"
                          >
                            <span>WhatsApp</span>
                            <ExternalLink size={10} />
                          </a>

                          {/* Pre-fill Org */}
                          {onPreFillOrg && (
                            <button
                              type="button"
                              onClick={() =>
                                onPreFillOrg(lead.companyName, lead.workEmail)
                              }
                              className="px-2.5 py-1.5 bg-ink-900 text-white hover:bg-ink-800 text-[11px] font-display font-extrabold uppercase tracking-wide transition-colors"
                              title="Provision an organization for this prospect"
                            >
                              Create Org
                            </button>
                          )}

                          {/* Delete Lead */}
                          {lead.id && (
                            <button
                              type="button"
                              onClick={() => lead.id && deleteLead(lead.id)}
                              className="p-1.5 text-ink-400 hover:text-rose-600 transition-colors"
                              title="Delete record"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
