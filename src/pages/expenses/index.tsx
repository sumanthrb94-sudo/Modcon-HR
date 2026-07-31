import { useState, useMemo, useEffect } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import {
  Receipt,
  Clock,
  CheckCircle,
  Wallet,
  Plus,
  ThumbsUp,
  ThumbsDown,
  IndianRupee,
  BarChart3,
  Paperclip,
  FileText,
  UploadCloud,
  Trash2,
  Loader2,
} from 'lucide-react';
import {
  PageHeader,
  Button,
  StatCard,
  Card,
  CardHeader,
  Tabs,
  Table,
  type Column,
  Badge,
  Modal,
  SearchInput,
  Select,
  Avatar,
} from '@/components/ui';
import { statusTone } from '@/components/ui';
import { formatINR, formatDate, cn } from '@/lib/utils';
import { expenseByCategory, getExpenseClaims, saveExpenseClaims } from '@/data/expenses';
import { employees, getEmployee, getEmployeeDirectory, getEmployeeName } from '@/data/employees';
import { useAuth } from '@/lib/auth';
import { resolveAppRole } from '@/lib/accessControl';
import { getCurrentEmployee } from '@/lib/currentEmployee';
import { Collections, patch, upsert } from '@/lib/db';
import { useExpenses } from '@/lib/useFirestore';
import type { ExpenseClaim, ExpenseCategory, ExpenseStatus } from '@/types';
import { currentMonthIso, todayIso } from '@/lib/today';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = 'all' | ExpenseStatus;
type CategoryFilter = 'all' | ExpenseCategory;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const CATEGORY_OPTIONS: { label: string; value: string }[] = [
  { label: 'Travel', value: 'Travel' },
  { label: 'Meals', value: 'Meals' },
  { label: 'Accommodation', value: 'Accommodation' },
  { label: 'Software', value: 'Software' },
  { label: 'Office Supplies', value: 'Office Supplies' },
  { label: 'Training', value: 'Training' },
  { label: 'Other', value: 'Other' },
];

const CATEGORY_FILTER_OPTIONS: { label: string; value: string }[] = [
  { label: 'All Categories', value: 'all' },
  ...CATEGORY_OPTIONS,
];

const categoryTone = (cat: ExpenseCategory): 'blue' | 'green' | 'amber' | 'violet' | 'cyan' | 'pink' | 'gray' => {
  const map: Record<ExpenseCategory, 'blue' | 'green' | 'amber' | 'violet' | 'cyan' | 'pink' | 'gray'> = {
    Travel: 'blue',
    Meals: 'green',
    Accommodation: 'amber',
    Software: 'violet',
    'Office Supplies': 'cyan',
    Training: 'pink',
    Other: 'gray',
  };
  return map[cat] ?? 'gray';
};

// ---------------------------------------------------------------------------
// New Claim Modal
// ---------------------------------------------------------------------------

interface NewClaimForm {
  employeeId: string;
  title: string;
  category: string;
  amount: string;
  date: string;
  description: string;
  receiptImage: string;
}

const EMPTY_FORM: NewClaimForm = {
  employeeId: '',
  title: '',
  category: '',
  amount: '',
  date: todayIso(),
  description: '',
  receiptImage: '',
};

interface NewClaimModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (claim: ExpenseClaim) => void;
  onSaveDraft: (claim: ExpenseClaim) => void;
  employeeOptions?: { label: string; value: string }[];
  defaultEmployeeId?: string;
}

function NewClaimModal({ open, onClose, onSubmit, onSaveDraft, employeeOptions, defaultEmployeeId }: NewClaimModalProps) {
  const [form, setForm] = useState<NewClaimForm>(() => ({ ...EMPTY_FORM, employeeId: defaultEmployeeId ?? '' }));
  const [errors, setErrors] = useState<Partial<Record<keyof NewClaimForm, string>>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [ocrSuccess, setOcrSuccess] = useState(false);

  const options = employeeOptions ?? getEmployeeDirectory().map((e) => ({
    label: e.fullName,
    value: e.id,
  }));

  const set = (field: keyof NewClaimForm) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG/JPG/etc.)');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result as string;
      setForm((f) => ({ ...f, receiptImage: base64String }));
      
      // Start OCR simulation
      setIsScanning(true);
      setOcrSuccess(false);

      setTimeout(() => {
        setIsScanning(false);
        setOcrSuccess(true);

        // Simulated OCR parsing logic based on filename or random choice
        const nameClean = file.name.toLowerCase();
        let parsedTitle = 'Receipt Claim';
        let parsedAmount = '1250';
        let parsedCategory = 'Meals';
        let parsedDesc = 'Scanned from receipt.';

        if (nameClean.includes('cab') || nameClean.includes('taxi') || nameClean.includes('uber') || nameClean.includes('ola')) {
          parsedTitle = 'Uber Cab Ride';
          parsedAmount = '650';
          parsedCategory = 'Travel';
          parsedDesc = 'Uber ride home after late-night release.';
        } else if (nameClean.includes('dinner') || nameClean.includes('lunch') || nameClean.includes('meal') || nameClean.includes('food') || nameClean.includes('starbucks')) {
          parsedTitle = 'Starbucks Coffee & Snacks';
          parsedAmount = '480';
          parsedCategory = 'Meals';
          parsedDesc = 'Team beverage during sync meeting.';
        } else if (nameClean.includes('aws') || nameClean.includes('github') || nameClean.includes('figma') || nameClean.includes('software')) {
          parsedTitle = 'AWS Monthly Bill';
          parsedAmount = '8500';
          parsedCategory = 'Software';
          parsedDesc = 'Development database hosting services.';
        } else if (nameClean.includes('hotel') || nameClean.includes('stay') || nameClean.includes('airbnb')) {
          parsedTitle = 'Hotel Accommodation';
          parsedAmount = '12000';
          parsedCategory = 'Accommodation';
          parsedDesc = 'Stay during annual company meetup.';
        } else {
          // Randomized defaults
          const titles = ['Office Desk Organizer', 'Broadband Internet bill', 'Client Business Dinner', 'Aviation Flight Ticket'];
          const amounts = ['1500', '2800', '4200', '16500'];
          const categories: ExpenseCategory[] = ['Office Supplies', 'Other', 'Meals', 'Travel'];
          const idx = Math.floor(Math.random() * titles.length);
          parsedTitle = titles[idx];
          parsedAmount = amounts[idx];
          parsedCategory = categories[idx];
          parsedDesc = `Reimbursement for ${titles[idx].toLowerCase()}.`;
        }

        setForm((f) => ({
          ...f,
          title: parsedTitle,
          amount: parsedAmount,
          category: parsedCategory,
          description: parsedDesc,
          date: todayIso(),
        }));

        // Remove success message after a few seconds
        setTimeout(() => setOcrSuccess(false), 5000);
      }, 1500);
    };
    reader.readAsDataURL(file);
  };

  function validate(): boolean {
    const e: Partial<Record<keyof NewClaimForm, string>> = {};
    if (!form.employeeId) e.employeeId = 'Select an employee';
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.category) e.category = 'Select a category';
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      e.amount = 'Enter a valid amount';
    if (!form.date) e.date = 'Date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const now = todayIso();
    const claim: ExpenseClaim = {
      id: `exp-${Date.now()}`,
      employeeId: form.employeeId || defaultEmployeeId || employees[0]?.id || '',
      title: form.title.trim(),
      category: form.category as ExpenseCategory,
      amount: Number(form.amount),
      date: form.date,
      status: 'Submitted',
      submittedOn: now,
      description: form.description.trim(),
      receiptImage: form.receiptImage || undefined,
    };
    onSubmit(claim);
    setForm(EMPTY_FORM);
    setErrors({});
    setIsScanning(false);
    setOcrSuccess(false);
    onClose();
  }

  function buildDraftClaim(): ExpenseClaim {
    const today = todayIso();
    const fallbackEmployeeId = employees[0]?.id ?? '';

    return {
      id: `exp-draft-${Date.now()}`,
      employeeId: form.employeeId || defaultEmployeeId || fallbackEmployeeId,
      title: form.title.trim() || 'Untitled Draft Claim',
      category: (form.category as ExpenseCategory) || 'Other',
      amount: Number(form.amount) || 0,
      date: form.date || today,
      status: 'Draft',
      submittedOn: today,
      description: form.description.trim(),
      receiptImage: form.receiptImage || undefined,
    };
  }

  function hasMeaningfulInput(): boolean {
    return Boolean(
      form.employeeId ||
        form.title.trim() ||
        form.category ||
        form.amount.trim() ||
        form.description.trim() ||
        form.receiptImage ||
        form.date !== EMPTY_FORM.date,
    );
  }

  function handleCancel() {
    if (hasMeaningfulInput()) {
      onSaveDraft(buildDraftClaim());
    }
    setForm({ ...EMPTY_FORM, employeeId: defaultEmployeeId ?? '' });
    setErrors({});
    setIsScanning(false);
    setOcrSuccess(false);
    onClose();
  }

  function handleClose() {
    setForm({ ...EMPTY_FORM, employeeId: defaultEmployeeId ?? '' });
    setErrors({});
    setIsScanning(false);
    setOcrSuccess(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New Expense Claim"
      subtitle="Submit a new reimbursement request"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Submit Claim
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Receipt Upload Zone */}
        <div className="relative">
          {isScanning && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-brand-100 bg-brand-50/50 p-6 text-center animate-pulse">
              <Loader2 className="animate-spin text-brand-600 mb-2" size={32} />
              <p className="text-sm font-semibold text-brand-900">Scanning receipt...</p>
              <p className="text-xs text-brand-600 mt-1">Extracting details via OCR</p>
            </div>
          )}

          {!isScanning && !form.receiptImage && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all cursor-pointer",
                isDragging
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-ink-200 hover:border-ink-300 hover:bg-ink-50/50 text-ink-500"
              )}
              onClick={() => {
                const fileInput = document.getElementById('receipt-upload-input');
                fileInput?.click();
              }}
            >
              <UploadCloud size={32} className={cn("mb-2", isDragging ? "text-brand-600" : "text-ink-400")} />
              <p className="text-sm font-medium text-ink-800">
                Drag & drop your receipt, or <span className="text-brand-600 font-semibold hover:underline">browse</span>
              </p>
              <p className="text-xs text-ink-400 mt-1">Supports PNG, JPG, JPEG up to 5MB</p>
              <input
                id="receipt-upload-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />
            </div>
          )}

          {!isScanning && form.receiptImage && (
            <div className="flex items-center gap-4 rounded-2xl border border-ink-100 bg-ink-50/50 p-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-ink-200 bg-white">
                <img src={form.receiptImage} alt="Receipt preview" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold text-ink-800">Receipt Attached</p>
                  {ocrSuccess && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 animate-bounce">
                      ✨ OCR Auto-filled
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-400 mt-0.5">Click "Submit" to complete the claim</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-600 transition-colors"
                onClick={() => {
                  setForm((f) => ({ ...f, receiptImage: '' }));
                  setOcrSuccess(false);
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Employee */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Employee</label>
          <Select
            value={form.employeeId}
            onChange={set('employeeId')}
            options={options}
            placeholder="Select employee…"
            className="w-full"
            disabled={isScanning}
          />
          {errors.employeeId && <p className="text-xs text-rose-600 mt-1">{errors.employeeId}</p>}
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Title</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set('title')(e.target.value)}
            placeholder="e.g. Client Dinner — Acme Corp"
            className="input w-full"
            disabled={isScanning}
          />
          {errors.title && <p className="text-xs text-rose-600 mt-1">{errors.title}</p>}
        </div>

        {/* Category & Amount */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Category</label>
            <Select
              value={form.category}
              onChange={set('category')}
              options={CATEGORY_OPTIONS}
              placeholder="Category…"
              className="w-full"
              disabled={isScanning}
            />
            {errors.category && <p className="text-xs text-rose-600 mt-1">{errors.category}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Amount (₹)</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => set('amount')(e.target.value)}
              placeholder="0"
              min={0}
              className="input w-full"
              disabled={isScanning}
            />
            {errors.amount && <p className="text-xs text-rose-600 mt-1">{errors.amount}</p>}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Expense Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => set('date')(e.target.value)}
            className="input w-full"
            disabled={isScanning}
          />
          {errors.date && <p className="text-xs text-rose-600 mt-1">{errors.date}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">
            Description <span className="text-ink-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={form.description}
            onChange={(e) => set('description')(e.target.value)}
            rows={3}
            placeholder="Provide additional details…"
            className="input w-full resize-none"
            disabled={isScanning}
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Claim Detail Modal
// ---------------------------------------------------------------------------

interface ClaimDetailModalProps {
  claim: ExpenseClaim | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onReimburse: (id: string) => void;
  canManage?: boolean;
}

function ClaimDetailModal({ claim, onClose, onApprove, onReject, onReimburse, canManage = true }: ClaimDetailModalProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  if (!claim) return null;
  const name = getEmployeeName(claim.employeeId);
  const emp = getEmployee(claim.employeeId);

  return (
    <>
      <Modal
        open={!!claim}
        onClose={onClose}
        title="Expense Claim Details"
        subtitle={claim.id}
        size="md"
        footer={
          <div className="flex justify-between items-center w-full">
            {canManage && claim.status === 'Submitted' ? (
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  icon={<ThumbsUp size={16} />}
                  onClick={() => {
                    onApprove(claim.id);
                    onClose();
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  icon={<ThumbsDown size={16} />}
                  onClick={() => {
                    onReject(claim.id);
                    onClose();
                  }}
                  className="text-rose-600 hover:bg-rose-50 border-rose-200"
                >
                  Reject
                </Button>
                <Button
                  variant="secondary"
                  icon={<Wallet size={16} />}
                  onClick={() => {
                    onReimburse(claim.id);
                    onClose();
                  }}
                  className="text-violet-700 hover:bg-violet-50 border-violet-200"
                >
                  Reimburse
                </Button>
              </div>
            ) : (
              <div />
            )}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Budget Alert Banner */}
          {claim.amount > 10000 && claim.status === 'Submitted' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-start gap-2.5 animate-bounce">
              <span className="text-amber-600 mt-0.5 text-base">⚠️</span>
              <div className="text-xs text-amber-800 leading-normal">
                <p className="font-semibold">High Amount Claim Alert</p>
                <p className="mt-0.5">This expense of {formatINR(claim.amount)} exceeds the standard ₹10,000 category budget threshold and requires manager verification.</p>
              </div>
            </div>
          )}

          {/* Employee Info Header */}
          <div className="flex items-center gap-3 pb-4 border-b border-ink-100">
            <Avatar name={name} size="md" />
            <div>
              <h4 className="font-semibold text-ink-900 text-base">{name}</h4>
              <p className="text-sm text-ink-500">
                {emp?.department || 'Department'} • {emp?.designation || 'Employee'}
              </p>
            </div>
          </div>

          {/* Claim Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider">Title</p>
              <p className="text-sm font-medium text-ink-800 mt-0.5">{claim.title}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider">Category</p>
              <div className="mt-0.5">
                <Badge tone={categoryTone(claim.category)}>{claim.category}</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider">Amount</p>
              <p className="text-base font-bold text-ink-900 mt-0.5">{formatINR(claim.amount)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider">Status</p>
              <div className="mt-0.5">
                <Badge tone={statusTone(claim.status)} dot>{claim.status}</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider">Expense Date</p>
              <p className="text-sm text-ink-700 mt-0.5">{formatDate(claim.date)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider">Submitted On</p>
              <p className="text-sm text-ink-700 mt-0.5">{formatDate(claim.submittedOn)}</p>
            </div>
          </div>

          {/* Description */}
          {claim.description && (
            <div className="pt-4 border-t border-ink-100">
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider">Description</p>
              <p className="text-sm text-ink-600 mt-1 whitespace-pre-line leading-relaxed">
                {claim.description}
              </p>
            </div>
          )}

          {/* Receipt Preview */}
          {claim.receiptImage && (
            <div className="pt-4 border-t border-ink-100">
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Attached Receipt</p>
              <div
                className="relative w-40 h-28 border border-ink-200 rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity bg-white group shadow-sm"
                onClick={() => setLightboxOpen(true)}
              >
                <img src={claim.receiptImage} alt="Receipt" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-ink-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold">
                  Click to Zoom
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Lightbox Lightbox Modal */}
      <Modal
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        title="Attached Receipt Image"
        subtitle={claim.title}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setLightboxOpen(false)}>
            Close Zoom
          </Button>
        }
      >
        <div className="flex justify-center items-center p-2 bg-ink-950 rounded-2xl overflow-hidden border border-ink-800">
          <img
            src={claim.receiptImage}
            alt="Receipt Full View"
            className="max-h-[60vh] max-w-full object-contain rounded-lg"
          />
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const STATUS_TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Submitted', label: 'Submitted' },
  { id: 'Approved', label: 'Approved' },
  { id: 'Reimbursed', label: 'Reimbursed' },
  { id: 'Rejected', label: 'Rejected' },
  { id: 'Draft', label: 'Draft' },
];

type ViewTab = 'claims' | 'analytics';

const VIEW_TABS = [
  { id: 'claims', label: 'Claims' },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={14} /> },
];

export function ExpensesPage() {
  const { profile } = useAuth();
  const role = resolveAppRole(profile);
  const isEmployee = role === 'Employee';
  const currentEmployee = getCurrentEmployee(profile);
  const { data: liveExpenses, loading: liveLoading } = useExpenses();
  // Seeded from the store and written through on every change, so an edit
  // is still there after a refresh.
  const [claims, setClaimsRaw] = useState(() => getExpenseClaims());
  const setClaims = (updater: Parameters<typeof setClaimsRaw>[0]) =>
    setClaimsRaw((prev) => saveExpenseClaims(typeof updater === 'function' ? (updater as (p: typeof prev) => typeof prev)(prev) : updater));
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [activeView, setActiveView] = useState<ViewTab>('claims');
  const [search, setSearch] = useState('');
  const [newClaimOpen, setNewClaimOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<ExpenseClaim | null>(null);

  const visibleClaims = useMemo(
    () => (isEmployee && currentEmployee ? claims.filter((claim) => claim.employeeId === currentEmployee.id) : claims),
    [claims, isEmployee, currentEmployee],
  );

  // Keep local state in sync with Firestore and preserve static demo data if the DB is partial.
  useEffect(() => {
    if (liveLoading) return;

    const mergedMap = new Map<string, ExpenseClaim>();
    setClaims((prev) => {
      // `prev` already starts from the store, which falls back to the seed
      // when a company has none of its own. Layering the raw seed underneath
      // as well would resurrect any claim that had been removed from the
      // stored set.
      for (const claim of prev) mergedMap.set(claim.id, claim);
      for (const claim of liveExpenses) mergedMap.set(claim.id, claim);

      return Array.from(mergedMap.values()).sort((a, b) =>
        b.submittedOn.localeCompare(a.submittedOn),
      );
    });
  }, [liveExpenses, liveLoading]);

  // ----- Actions -----
  // No `ownerUid` here any more. The claim used to be stamped with one because
  // the rules were said to check it — they never did, and `employee_links` is
  // how an account resolves to an employee everywhere else in this app. The
  // expenses rules now use `isSelf(resource.data.employeeId)` like their own
  // get/list rules do, so `employeeId` is the only identity the document needs.
  async function handleAddClaim(claim: ExpenseClaim) {
    setClaims((prev) => [claim, ...prev]);
    setActiveView('claims');
    setActiveTab('Submitted');
    setActiveCategory('all');
    setSearch('');
    setSelectedClaim(claim);

    try {
      await upsert(Collections.expenses, claim.id, claim);
    } catch (err) {
      console.error('Failed to save expense claim to Firestore:', err);
    }
  }

  async function handleSaveDraft(claim: ExpenseClaim) {
    setClaims((prev) => [claim, ...prev]);
    setActiveView('claims');
    setActiveTab('Draft');
    setActiveCategory('all');
    setSearch('');

    try {
      await upsert(Collections.expenses, claim.id, claim);
    } catch (err) {
      console.error('Failed to save draft expense claim to Firestore:', err);
    }
  }

  async function handleApprove(id: string) {
    if (isEmployee) return;
    setClaims((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'Approved' as ExpenseStatus } : c)),
    );

    try {
      await patch(Collections.expenses, id, { status: 'Approved' });
    } catch (err) {
      console.error('Failed to approve expense claim in Firestore:', err);
    }
  }

  async function handleReject(id: string) {
    if (isEmployee) return;
    setClaims((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'Rejected' as ExpenseStatus } : c)),
    );

    try {
      await patch(Collections.expenses, id, { status: 'Rejected' });
    } catch (err) {
      console.error('Failed to reject expense claim in Firestore:', err);
    }
  }

  async function handleReimburse(id: string) {
    if (isEmployee) return;
    setClaims((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'Reimbursed' as ExpenseStatus } : c)),
    );

    try {
      await patch(Collections.expenses, id, { status: 'Reimbursed' });
    } catch (err) {
      console.error('Failed to mark expense claim reimbursed in Firestore:', err);
    }
  }

  // ----- Aggregates -----
  const stats = useMemo(() => {
    const total = visibleClaims.length;
    const submittedCount = visibleClaims.filter((c) => c.status === 'Submitted').length;
    const submittedAmount = visibleClaims
      .filter((c) => c.status === 'Submitted')
      .reduce((s, c) => s + c.amount, 0);
    const approvedThisMonth = visibleClaims.filter(
      (c) => c.status === 'Approved' && c.submittedOn.startsWith(currentMonthIso()),
    ).length;
    const reimbursedTotal = visibleClaims
      .filter((c) => c.status === 'Reimbursed')
      .reduce((s, c) => s + c.amount, 0);
    return { total, submittedCount, submittedAmount, approvedThisMonth, reimbursedTotal };
  }, [visibleClaims]);


  // ----- Tab counts -----
  const tabsWithCounts = useMemo(
    () =>
      STATUS_TABS.map((t) => ({
        ...t,
        count:
          t.id === 'all'
            ? visibleClaims.length
            : visibleClaims.filter((c) => c.status === t.id).length,
      })),
    [visibleClaims],
  );

  // ----- Filtered claims -----
  const filteredClaims = useMemo(() => {
    return visibleClaims.filter((c) => {
      const matchesTab = activeTab === 'all' || c.status === activeTab;
      const matchesCategory = activeCategory === 'all' || c.category === activeCategory;
      const q = search.toLowerCase();
      const empName = getEmployeeName(c.employeeId).toLowerCase();
      const matchesSearch =
        !q ||
        c.title.toLowerCase().includes(q) ||
        empName.includes(q) ||
        c.category.toLowerCase().includes(q);
      return matchesTab && matchesCategory && matchesSearch;
    });
  }, [visibleClaims, activeTab, activeCategory, search]);

  // ----- Chart data -----
  const chartData = useMemo(() => expenseByCategory(filteredClaims), [filteredClaims]);

  const statusChartData = useMemo(
    () =>
      STATUS_TABS.filter((tab) => tab.id !== 'all').map((tab) => ({
        status: tab.label,
        count: visibleClaims.filter((claim) => claim.status === tab.id).length,
      })),
    [visibleClaims],
  );

  const monthlySpendData = useMemo(() => {
    const monthlyTotals = filteredClaims.reduce<Record<string, number>>((acc, claim) => {
      const monthKey = claim.submittedOn.slice(0, 7);
      acc[monthKey] = (acc[monthKey] ?? 0) + claim.amount;
      return acc;
    }, {});

    return Object.entries(monthlyTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({
        month,
        total,
      }));
  }, [filteredClaims]);

  // ----- Table columns -----
  const columns: Column<ExpenseClaim>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (c) => {
        const name = getEmployeeName(c.employeeId);
        const emp = getEmployee(c.employeeId);
        return (
          <div className="flex items-center gap-3">
            <Avatar name={name} size="sm" />
            <div>
              <p className="font-medium text-ink-900">{name}</p>
              <p className="text-xs text-ink-400">{emp?.department}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'title',
      header: 'Title',
      render: (c) => (
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-ink-800">{c.title}</span>
            {c.receiptImage && (
              <span title="Receipt attached" className="inline-flex shrink-0">
                <Paperclip size={12} className="text-ink-400" />
              </span>
            )}
          </div>
          {c.description && (
            <p className="text-xs text-ink-400 truncate max-w-xs">{c.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (c) => (
        <Badge tone={categoryTone(c.category)}>{c.category}</Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (c) => (
        <span className="font-semibold text-ink-900">{formatINR(c.amount)}</span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (c) => <span className="text-ink-600">{formatDate(c.date)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Badge tone={statusTone(c.status)} dot>
          {c.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (c) =>
        !isEmployee && c.status === 'Submitted' ? (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<ThumbsUp size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                handleApprove(c.id);
              }}
              className="text-emerald-600 hover:bg-emerald-50"
            >
              Approve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<ThumbsDown size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                handleReject(c.id);
              }}
              className="text-rose-600 hover:bg-rose-50"
            >
              Reject
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Wallet size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                handleReimburse(c.id);
              }}
              className="text-violet-700 hover:bg-violet-50"
            >
              Reimburse
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Track, approve, and reimburse employee expense claims"
        actions={
          <Button
            icon={<Plus size={16} />}
            variant="primary"
            onClick={() => setNewClaimOpen(true)}
          >
            New Claim
          </Button>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Claims"
          value={stats.total}
          icon={<IndianRupee size={22} />}
          iconClass="bg-brand-50 text-brand-600"
          onClick={() => setActiveTab('all')}
          active={activeTab === 'all'}
        />
        <StatCard
          label="Pending Approval"
          value={stats.submittedCount}
          icon={<Clock size={22} />}
          iconClass="bg-amber-50 text-amber-600"
          onClick={() => setActiveTab('Submitted')}
          active={activeTab === 'Submitted'}
          footer={
            <span className="text-ink-400 text-sm">
              {formatINR(stats.submittedAmount, { compact: true })} pending
            </span>
          }
        />
        <StatCard
          label="Approved This Month"
          value={stats.approvedThisMonth}
          icon={<CheckCircle size={22} />}
          iconClass="bg-emerald-50 text-emerald-600"
          onClick={() => setActiveTab('Approved')}
          active={activeTab === 'Approved'}
        />
        <StatCard
          label="Reimbursed (Total)"
          value={formatINR(stats.reimbursedTotal, { compact: true })}
          icon={<Wallet size={22} />}
          iconClass="bg-violet-50 text-violet-600"
          onClick={() => setActiveTab('Reimbursed')}
          active={activeTab === 'Reimbursed'}
        />
      </div>

      {/* View Switch */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="inline-flex rounded-lg border border-ink-200 bg-white p-1">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveView(tab.id as ViewTab)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeView === tab.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-ink-600 hover:bg-ink-50'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="w-52">
          <Select
            value={activeCategory}
            onChange={(val) => setActiveCategory(val as CategoryFilter)}
            options={CATEGORY_FILTER_OPTIONS}
            className="w-full"
          />
        </div>
      </div>

      {activeView === 'claims' ? (
        <>
          {/* Chart + Table layout */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Donut chart */}
            <Card className="xl:col-span-1">
          <CardHeader title="Expenses by Category" subtitle="Current selection" />
          <div className="h-64 flex flex-col justify-center items-center">
            {chartData.length === 0 ? (
              <div className="text-center text-ink-400 p-4">
                <Receipt size={32} className="mx-auto mb-2 text-ink-300 animate-pulse" />
                <p className="text-sm font-medium">No data available</p>
                <p className="text-xs text-ink-400 mt-1">No claims match the active filters.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="total"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={88}
                    paddingAngle={3}
                    cursor="pointer"
                    onClick={(entry: { category?: string }) => {
                      if (!entry?.category) return;
                      setActiveCategory(entry.category as CategoryFilter);
                    }}
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${entry.category}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [formatINR(value, { compact: true }), 'Amount']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => (
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
            </Card>

        {/* Summary by category */}
            <Card className="xl:col-span-2">
          <CardHeader title="Category Breakdown" subtitle="Total claimed per category in selection" />
          <div className="divide-y divide-ink-100 min-h-64 flex flex-col justify-center">
            {chartData.length === 0 ? (
              <div className="text-center text-ink-400 p-4">
                <p className="text-sm font-medium text-ink-500">No data to display</p>
              </div>
            ) : (
              chartData.map((row, i) => {
                const grandTotal = chartData.reduce((s, r) => s + r.total, 0);
                const pct = grandTotal ? Math.round((row.total / grandTotal) * 100) : 0;
                return (
                  <button
                    key={row.category}
                    type="button"
                    onClick={() => setActiveCategory(row.category as CategoryFilter)}
                    className="flex items-center gap-4 py-3 w-full text-left hover:bg-ink-50/70 rounded-md px-2"
                  >
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="text-sm text-ink-700 flex-1">{row.category}</span>
                    <div className="flex-1 bg-ink-100 rounded-full h-1.5 max-w-[120px]">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      />
                    </div>
                    <span className="text-xs text-ink-400 w-8 text-right">{pct}%</span>
                    <span className="text-sm font-semibold text-ink-900 w-20 text-right">
                      {formatINR(row.total, { compact: true })}
                    </span>
                  </button>
                );
              })
            )}
          </div>
            </Card>
          </div>

          {/* Claims Table */}
          <Card padding={false}>
            <div className="px-5 pt-5">
              <Tabs
                tabs={tabsWithCounts}
                active={activeTab}
                onChange={(id) => setActiveTab(id as TabId)}
              />
            </div>

            <div className="p-5">
              <div className="mb-4">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search by employee, title, category…"
                  className="max-w-sm"
                />
              </div>
              <Table<ExpenseClaim>
                columns={columns}
                data={filteredClaims}
                keyExtractor={(c) => c.id}
                emptyMessage="No claims found"
                onRowClick={(c) => setSelectedClaim(c)}
              />
            </div>
          </Card>
        </>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Claims by Status"
              subtitle="Distribution across all claims"
            />
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="status" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(value: number) => [value, 'Claims']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#6366f1"
                    radius={[6, 6, 0, 0]}
                    onClick={(point: { status?: string }) => {
                      if (!point?.status) return;
                      setActiveTab(point.status as TabId);
                      setActiveView('claims');
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Submitted Spend Trend"
              subtitle="Monthly amount for current filters"
            />
            <div className="h-72">
              {monthlySpendData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-ink-400">
                  <BarChart3 size={28} className="mb-2 text-ink-300" />
                  <p className="text-sm font-medium">No trend data available</p>
                  <p className="text-xs mt-1">Adjust filters to include submitted claims.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlySpendData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <Tooltip
                      formatter={(value: number) => [formatINR(value), 'Submitted']}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#10b981' }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* New Claim Modal */}
      <NewClaimModal
        open={newClaimOpen}
        onClose={() => setNewClaimOpen(false)}
        onSubmit={handleAddClaim}
        onSaveDraft={handleSaveDraft}
        employeeOptions={currentEmployee ? [{ label: currentEmployee.fullName, value: currentEmployee.id }] : undefined}
        defaultEmployeeId={currentEmployee?.id}
      />

      {/* Claim Detail Modal */}
      <ClaimDetailModal
        claim={selectedClaim}
        onClose={() => setSelectedClaim(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onReimburse={handleReimburse}
        canManage={!isEmployee}
      />
    </div>
  );
}
