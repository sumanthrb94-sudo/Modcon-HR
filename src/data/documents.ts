import { useEffect, useState } from 'react';
import { isMockDataCleared } from '@/lib/mockDataFlag';
import { orgScopedKey } from '@/lib/orgScope';

export type DocumentStatus = 'Verified' | 'Pending' | 'Expired';

export interface DocumentRecord {
  id: string;
  name: string;
  type: string;
  status: DocumentStatus;
  uploaded: string;
  size: string;
}

export interface EmployeeDocumentLibrary extends DocumentRecord {
  employeeId: string;
}

interface DocumentLibraryState {
  employeeId: string;
  documents: DocumentRecord[];
}

const DOCUMENT_LIBRARY_INDEX_KEY = 'modcon.hr.documentLibrary.index';
const DOCUMENT_LIBRARY_KEY_PREFIX = 'modcon.hr.documentLibrary.';
export const DOCUMENT_LIBRARY_CHANGED_EVENT = 'modcon-hr-document-library-changed';

const SEED_DOCUMENTS: DocumentRecord[] = [
  { id: 'doc-1', name: 'Offer Letter', type: 'PDF', status: 'Verified', uploaded: '2021-01-15', size: '245 KB' },
  { id: 'doc-2', name: 'Employment Contract', type: 'PDF', status: 'Verified', uploaded: '2021-01-18', size: '512 KB' },
  { id: 'doc-3', name: 'Aadhaar Card', type: 'PDF', status: 'Verified', uploaded: '2021-02-01', size: '180 KB' },
  { id: 'doc-4', name: 'PAN Card', type: 'PDF', status: 'Verified', uploaded: '2021-02-01', size: '95 KB' },
  { id: 'doc-5', name: 'Bank Account Details', type: 'PDF', status: 'Verified', uploaded: '2021-02-05', size: '120 KB' },
  { id: 'doc-6', name: 'Educational Certificates', type: 'ZIP', status: 'Pending', uploaded: '2021-02-10', size: '2.1 MB' },
  { id: 'doc-7', name: 'Previous Relieving Letter', type: 'PDF', status: 'Verified', uploaded: '2021-02-10', size: '310 KB' },
  { id: 'doc-8', name: 'Medical Insurance Form', type: 'PDF', status: 'Expired', uploaded: '2022-04-01', size: '88 KB' },
];

function libraryKey(employeeId: string) {
  return orgScopedKey(`${DOCUMENT_LIBRARY_KEY_PREFIX}${employeeId}`);
}

function normalizeDocuments(documents: unknown): DocumentRecord[] {
  if (!Array.isArray(documents)) return [];
  return documents.filter((item): item is DocumentRecord => {
    return Boolean(
      item
        && typeof item === 'object'
        && typeof item.id === 'string'
        && typeof item.name === 'string'
        && typeof item.type === 'string'
        && (item.status === 'Verified' || item.status === 'Pending' || item.status === 'Expired')
        && typeof item.uploaded === 'string'
        && typeof item.size === 'string',
    );
  });
}

function buildSeedDocuments(employeeId: string): DocumentRecord[] {
  return SEED_DOCUMENTS.map((document) => ({
    ...document,
    id: `${employeeId}-${document.id}`,
  }));
}

function readKnownEmployeeIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(orgScopedKey(DOCUMENT_LIBRARY_INDEX_KEY));
    if (!raw) {
      // A freshly-created org has no relationship to the seed emp-001..006
      // IDs — only the default/legacy org bootstraps with them.
      if (isMockDataCleared()) return [];
      const initialIds = ['emp-001', 'emp-002', 'emp-003', 'emp-004', 'emp-005', 'emp-006'];
      window.localStorage.setItem(orgScopedKey(DOCUMENT_LIBRARY_INDEX_KEY), JSON.stringify(initialIds));
      return initialIds;
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function writeKnownEmployeeIds(employeeIds: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(orgScopedKey(DOCUMENT_LIBRARY_INDEX_KEY), JSON.stringify(Array.from(new Set(employeeIds))));
}

function readStoredDocuments(employeeId: string): DocumentRecord[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(libraryKey(employeeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const state = parsed as Partial<DocumentLibraryState>;
    return normalizeDocuments(state.documents);
  } catch {
    return null;
  }
}

function writeStoredDocuments(employeeId: string, documents: DocumentRecord[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    libraryKey(employeeId),
    JSON.stringify({ employeeId, documents } satisfies DocumentLibraryState),
  );
  writeKnownEmployeeIds([employeeId, ...readKnownEmployeeIds()]);
}

function notifyDocumentLibraryChanged(employeeId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DOCUMENT_LIBRARY_CHANGED_EVENT, { detail: { employeeId } }));
}

function getOrSeedEmployeeDocuments(employeeId: string): DocumentRecord[] {
  const stored = readStoredDocuments(employeeId);
  if (stored && stored.length > 0) return stored;
  // A freshly-created org's employees have no relationship to this fixed
  // demo document set — leave their library empty until documents are
  // actually uploaded.
  if (isMockDataCleared()) return stored ?? [];

  const seeded = buildSeedDocuments(employeeId);
  writeStoredDocuments(employeeId, seeded);
  return seeded;
}

export function getDocumentLibrary(employeeId: string): DocumentRecord[] {
  return getOrSeedEmployeeDocuments(employeeId);
}

export function getAllEmployeeDocumentLibraries(): EmployeeDocumentLibrary[] {
  if (typeof window === 'undefined') return [];

  const knownEmployeeIds = readKnownEmployeeIds();
  return knownEmployeeIds.flatMap((employeeId) => {
    const documents = getDocumentLibrary(employeeId);
    return documents.map((document) => ({
      ...document,
      employeeId,
    }));
  });
}

export function useEmployeeDocumentLibrary(employeeId: string | null | undefined) {
  const [documents, setDocuments] = useState<DocumentRecord[]>(() => (employeeId ? getDocumentLibrary(employeeId) : []));

  useEffect(() => {
    if (!employeeId) {
      setDocuments([]);
      return;
    }

    const currentEmployeeId = employeeId;
    setDocuments(getDocumentLibrary(currentEmployeeId));

    function handleDocumentLibraryChanged(event: Event) {
      const customEvent = event as CustomEvent<{ employeeId?: string }>;
      if (customEvent.detail?.employeeId && customEvent.detail.employeeId !== currentEmployeeId) return;
      setDocuments(getDocumentLibrary(currentEmployeeId));
    }

    window.addEventListener(DOCUMENT_LIBRARY_CHANGED_EVENT, handleDocumentLibraryChanged);
    window.addEventListener('storage', handleDocumentLibraryChanged);

    return () => {
      window.removeEventListener(DOCUMENT_LIBRARY_CHANGED_EVENT, handleDocumentLibraryChanged);
      window.removeEventListener('storage', handleDocumentLibraryChanged);
    };
  }, [employeeId]);

  return documents;
}

export function useAllEmployeeDocumentLibraries() {
  const [documents, setDocuments] = useState<EmployeeDocumentLibrary[]>(() => getAllEmployeeDocumentLibraries());

  useEffect(() => {
    function syncDocuments() {
      setDocuments(getAllEmployeeDocumentLibraries());
    }

    window.addEventListener(DOCUMENT_LIBRARY_CHANGED_EVENT, syncDocuments);
    window.addEventListener('storage', syncDocuments);

    return () => {
      window.removeEventListener(DOCUMENT_LIBRARY_CHANGED_EVENT, syncDocuments);
      window.removeEventListener('storage', syncDocuments);
    };
  }, []);

  return documents;
}

export async function addDocumentToLibrary(employeeId: string, document: DocumentRecord) {
  const nextDocuments = [document, ...getDocumentLibrary(employeeId).filter((item) => item.id !== document.id)];
  writeStoredDocuments(employeeId, nextDocuments);
  notifyDocumentLibraryChanged(employeeId);
  return nextDocuments;
}

export async function updateDocumentStatus(employeeId: string, documentId: string, status: DocumentStatus) {
  const nextDocuments = getDocumentLibrary(employeeId).map((document) =>
    document.id === documentId ? { ...document, status } : document,
  );
  writeStoredDocuments(employeeId, nextDocuments);
  notifyDocumentLibraryChanged(employeeId);
  return nextDocuments;
}
