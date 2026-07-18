import { useState, useMemo } from 'react';
import {
  Monitor,
  Package,
  Wrench,
  CheckCircle2,
  IndianRupee,
  Plus,
  UserCheck,
  UserX,
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
  Modal,
  SearchInput,
  Select,
  Card,
  CardHeader,
} from '@/components/ui';
import { assets as initialAssets, assetsByCategory } from '@/data/assets';
import { employees } from '@/data/employees';
import type { Asset, AssetCategory, AssetStatus } from '@/types';
import { formatINR, formatDate } from '@/lib/utils';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<AssetCategory, string> = {
  Laptop: '#6366f1',
  Monitor: '#06b6d4',
  Phone: '#f59e0b',
  Accessories: '#10b981',
  Furniture: '#f43f5e',
  'Software License': '#8b5cf6',
};

const CATEGORY_OPTIONS: { label: string; value: string }[] = [
  { label: 'All Categories', value: '' },
  { label: 'Laptop', value: 'Laptop' },
  { label: 'Monitor', value: 'Monitor' },
  { label: 'Phone', value: 'Phone' },
  { label: 'Accessories', value: 'Accessories' },
  { label: 'Furniture', value: 'Furniture' },
  { label: 'Software License', value: 'Software License' },
];

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'All Statuses', value: '' },
  { label: 'Assigned', value: 'Assigned' },
  { label: 'Available', value: 'Available' },
  { label: 'In Repair', value: 'In Repair' },
  { label: 'Retired', value: 'Retired' },
];

const CATEGORY_BADGE_TONE: Record<AssetCategory, 'blue' | 'cyan' | 'amber' | 'green' | 'red' | 'violet'> = {
  Laptop: 'blue',
  Monitor: 'cyan',
  Phone: 'amber',
  Accessories: 'green',
  Furniture: 'red',
  'Software License': 'violet',
};

// ---------------------------------------------------------------------------
// Assign Modal
// ---------------------------------------------------------------------------

interface AssignModalProps {
  asset: Asset | null;
  onClose: () => void;
  onAssign: (assetId: string, empId: string | null) => void;
}

function AssignModal({ asset, onClose, onAssign }: AssignModalProps) {
  const [selectedEmpId, setSelectedEmpId] = useState(asset?.assignedToId ?? '');

  if (!asset) return null;

  const empOptions: { label: string; value: string }[] = [
    { label: '— Unassign —', value: '' },
    ...employees
      .filter((e) => e.status === 'Active' || e.status === 'Probation')
      .map((e) => ({ label: e.fullName, value: e.id })),
  ];

  const handleSave = () => {
    onAssign(asset.id, selectedEmpId || null);
    onClose();
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`Assign / Reassign Asset`}
      subtitle={`${asset.assetCode} · ${asset.name}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {selectedEmpId ? 'Assign' : 'Unassign'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-ink-700 mb-1">Current Assignee</p>
          {asset.assignedToName ? (
            <div className="flex items-center gap-2">
              <Avatar name={asset.assignedToName} size="sm" />
              <span className="text-sm text-ink-800">{asset.assignedToName}</span>
            </div>
          ) : (
            <p className="text-sm text-ink-400">Not assigned</p>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-ink-700 block mb-1">Assign To</label>
          <Select
            value={selectedEmpId}
            onChange={setSelectedEmpId}
            options={empOptions}
            className="w-full"
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Add Asset Modal
// ---------------------------------------------------------------------------

interface AddAssetModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (asset: Omit<Asset, 'id'>) => void;
}

const EMPTY_ASSET_FORM = {
  name: '',
  category: '' as AssetCategory | '',
  serialNumber: '',
  purchaseDate: new Date().toISOString().slice(0, 10),
  value: '',
};

function AddAssetModal({ open, onClose, onAdd }: AddAssetModalProps) {
  const [form, setForm] = useState(EMPTY_ASSET_FORM);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSave = () => {
    if (!form.name.trim() || !form.category || !form.serialNumber.trim() || !form.value) {
      setError('Please fill all required fields.');
      return;
    }
    const assetCode = `AST-${Math.floor(1000 + Math.random() * 9000)}`;
    onAdd({
      assetCode,
      name: form.name.trim(),
      category: form.category as AssetCategory,
      status: 'Available',
      assignedToId: null,
      assignedToName: undefined,
      purchaseDate: form.purchaseDate,
      value: Number(form.value),
      serialNumber: form.serialNumber.trim(),
    });
    setForm(EMPTY_ASSET_FORM);
    setError('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add New Asset"
      subtitle="Register a new company asset"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Add Asset</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-ink-700 block mb-1">Asset Name *</label>
          <input
            className="input w-full"
            placeholder="e.g. MacBook Pro 14"
            value={form.name}
            onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setError(''); }}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink-700 block mb-1">Category *</label>
          <Select
            value={form.category}
            onChange={(v) => { setForm((f) => ({ ...f, category: v as AssetCategory })); setError(''); }}
            options={CATEGORY_OPTIONS.filter((c) => c.value)}
            className="w-full"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink-700 block mb-1">Serial Number *</label>
          <input
            className="input w-full"
            placeholder="e.g. SN-2026-0001"
            value={form.serialNumber}
            onChange={(e) => { setForm((f) => ({ ...f, serialNumber: e.target.value })); setError(''); }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-ink-700 block mb-1">Purchase Date</label>
            <input
              type="date"
              className="input w-full"
              value={form.purchaseDate}
              onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700 block mb-1">Value (₹) *</label>
            <input
              type="number"
              className="input w-full"
              placeholder="e.g. 85000"
              value={form.value}
              onChange={(e) => { setForm((f) => ({ ...f, value: e.target.value })); setError(''); }}
            />
          </div>
        </div>
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// AssetsPage
// ---------------------------------------------------------------------------

export function AssetsPage() {
  const [assetList, setAssetList] = useState<Asset[]>(initialAssets);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assignAsset, setAssignAsset] = useState<Asset | null>(null);
  const [addAssetOpen, setAddAssetOpen] = useState(false);

  // Stat card aggregates
  const stats = useMemo(() => {
    const total = assetList.length;
    const assigned = assetList.filter((a) => a.status === 'Assigned').length;
    const available = assetList.filter((a) => a.status === 'Available').length;
    const inRepair = assetList.filter((a) => a.status === 'In Repair').length;
    const totalValue = assetList.reduce((s, a) => s + a.value, 0);
    return { total, assigned, available, inRepair, totalValue };
  }, [assetList]);

  // Category chart data (uses stable initial data for chart)
  const categoryData = useMemo(
    () =>
      assetsByCategory().map((d) => ({
        name: d.category,
        value: d.count,
        color: CATEGORY_COLORS[d.category as AssetCategory] ?? '#94a3b8',
      })),
    [],
  );

  // Filtered assets
  const filteredAssets = useMemo(() => {
    const q = search.toLowerCase();
    return assetList.filter((a) => {
      const matchSearch =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.assetCode.toLowerCase().includes(q) ||
        a.serialNumber.toLowerCase().includes(q) ||
        (a.assignedToName ?? '').toLowerCase().includes(q);
      const matchCategory = !categoryFilter || a.category === categoryFilter;
      const matchStatus = !statusFilter || a.status === statusFilter;
      return matchSearch && matchCategory && matchStatus;
    });
  }, [assetList, search, categoryFilter, statusFilter]);

  const handleAssign = (assetId: string, empId: string | null) => {
    const emp = empId ? employees.find((e) => e.id === empId) : null;
    setAssetList((prev) =>
      prev.map((a) => {
        if (a.id !== assetId) return a;
        return {
          ...a,
          assignedToId: empId,
          assignedToName: emp?.fullName,
          status: empId ? ('Assigned' as AssetStatus) : ('Available' as AssetStatus),
        };
      }),
    );
  };

  const handleAddAsset = (asset: Omit<Asset, 'id'>) => {
    const newAsset: Asset = { ...asset, id: `ast-${Date.now()}` };
    setAssetList((prev) => [newAsset, ...prev]);
  };

  const columns: Column<Asset>[] = [
    {
      key: 'asset',
      header: 'Asset',
      render: (row) => (
        <div>
          <p className="font-semibold text-ink-800">{row.name}</p>
          <p className="text-xs text-ink-400">{row.assetCode}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => (
        <Badge tone={CATEGORY_BADGE_TONE[row.category]}>{row.category}</Badge>
      ),
    },
    {
      key: 'serial',
      header: 'Serial No.',
      render: (row) => (
        <span className="text-xs font-mono text-ink-500">{row.serialNumber}</span>
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
      key: 'assignedTo',
      header: 'Assigned To',
      render: (row) =>
        row.assignedToName ? (
          <div className="flex items-center gap-2">
            <Avatar name={row.assignedToName} size="sm" />
            <span className="text-sm text-ink-700">{row.assignedToName}</span>
          </div>
        ) : (
          <span className="text-ink-400 text-sm">—</span>
        ),
    },
    {
      key: 'purchaseDate',
      header: 'Purchased',
      render: (row) => (
        <span className="text-sm text-ink-500">{formatDate(row.purchaseDate)}</span>
      ),
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      render: (row) => (
        <span className="text-sm font-semibold text-ink-700">{formatINR(row.value)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            setAssignAsset(row);
          }}
        >
          {row.assignedToId ? (
            <span className="flex items-center gap-1">
              <UserCheck size={14} />
              Reassign
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <UserX size={14} />
              Assign
            </span>
          )}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Assets"
        subtitle="Manage company assets — hardware, software licences and furniture."
        actions={
          <Button onClick={() => setAddAssetOpen(true)}>
            <Plus size={16} className="mr-1" />
            Add Asset
          </Button>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <StatCard
          label="Total Assets"
          value={stats.total}
          icon={<Package size={22} />}
          iconClass="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Assigned"
          value={stats.assigned}
          icon={<CheckCircle2 size={22} />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Available"
          value={stats.available}
          icon={<Monitor size={22} />}
          iconClass="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="In Repair"
          value={stats.inRepair}
          icon={<Wrench size={22} />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Total Value"
          value={formatINR(stats.totalValue, { compact: true })}
          icon={<IndianRupee size={22} />}
          iconClass="bg-rose-50 text-rose-600"
        />
      </div>

      {/* Category Pie Chart */}
      <Card className="mb-6">
        <CardHeader title="Assets by Category" />
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={categoryData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
            >
              {categoryData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: '8px', fontSize: '13px' }}
              formatter={(value: number, name: string) => [value, name]}
            />
            <Legend
              iconType="circle"
              iconSize={10}
              wrapperStyle={{ fontSize: '13px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="flex flex-wrap gap-3 p-5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, code, serial or person…"
            className="w-72"
          />
          <Select
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={CATEGORY_OPTIONS}
            className="w-44"
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            className="w-40"
          />
        </div>
        <Table
          columns={columns}
          data={filteredAssets}
          keyExtractor={(r) => r.id}
          emptyMessage="No assets match your filters."
        />
      </div>

      {/* Assign Modal */}
      {assignAsset && (
        <AssignModal
          asset={assignAsset}
          onClose={() => setAssignAsset(null)}
          onAssign={handleAssign}
        />
      )}

      {/* Add Asset Modal */}
      <AddAssetModal
        open={addAssetOpen}
        onClose={() => setAddAssetOpen(false)}
        onAdd={handleAddAsset}
      />
    </div>
  );
}
