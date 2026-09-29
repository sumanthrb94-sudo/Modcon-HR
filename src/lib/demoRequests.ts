import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from './firebase';

export interface DemoRequest {
  id?: string;
  fullName: string;
  companyName: string;
  workEmail: string;
  phone: string;
  teamSize: string;
  preferredSlot?: string;
  message?: string;
  status: 'New' | 'Contacted' | 'Demo Scheduled' | 'Converted' | 'Disqualified';
  createdAt?: unknown;
  createdAtIso?: string;
}

const LOCAL_STORAGE_DEMO_LEADS_KEY = 'modcon.hr.demo_leads_cache';

function getLocalDemoLeads(): DemoRequest[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_DEMO_LEADS_KEY);
    return raw ? (JSON.parse(raw) as DemoRequest[]) : [];
  } catch {
    return [];
  }
}

function saveLocalDemoLead(lead: DemoRequest) {
  try {
    const existing = getLocalDemoLeads();
    localStorage.setItem(
      LOCAL_STORAGE_DEMO_LEADS_KEY,
      JSON.stringify([lead, ...existing]),
    );
  } catch {
    // ignore
  }
}

export async function submitDemoRequest(
  data: Omit<DemoRequest, 'id' | 'status' | 'createdAt' | 'createdAtIso'>,
): Promise<string> {
  const payload: Omit<DemoRequest, 'id'> = {
    ...data,
    status: 'New',
    createdAt: serverTimestamp(),
    createdAtIso: new Date().toISOString(),
  };

  try {
    const docRef = await addDoc(collection(db, 'demo_requests'), payload);
    saveLocalDemoLead({ id: docRef.id, ...payload });
    return docRef.id;
  } catch (err) {
    // If network fails or offline, preserve in local storage
    const fallbackId = 'lead_' + Date.now();
    saveLocalDemoLead({ id: fallbackId, ...payload });
    return fallbackId;
  }
}

export function useDemoRequests() {
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>(() =>
    getLocalDemoLeads(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'demo_requests'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: DemoRequest[] = [];
        snapshot.forEach((d) => {
          items.push({
            id: d.id,
            ...(d.data() as Omit<DemoRequest, 'id'>),
          });
        });

        if (items.length > 0) {
          setDemoRequests(items);
        } else {
          // Fallback to local cache if collection is empty
          setDemoRequests(getLocalDemoLeads());
        }
        setLoading(false);
      },
      (err) => {
        console.warn('Could not read demo_requests from Firestore, using local fallback:', err);
        setDemoRequests(getLocalDemoLeads());
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  async function updateStatus(id: string, newStatus: DemoRequest['status']) {
    try {
      await updateDoc(doc(db, 'demo_requests', id), { status: newStatus });
    } catch {
      // update local cache
      setDemoRequests((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item)),
      );
    }
  }

  async function deleteLead(id: string) {
    try {
      await deleteDoc(doc(db, 'demo_requests', id));
    } catch {
      setDemoRequests((prev) => prev.filter((item) => item.id !== id));
    }
  }

  return { demoRequests, loading, error, updateStatus, deleteLead };
}

export function getWhatsAppDemoLink(details?: {
  name?: string;
  company?: string;
  teamSize?: string;
  phone?: string;
}) {
  const hotline = '917799934943';
  let message = 'Hello Modcon HR Team, I would like to book a demo and learn more about Modcon HR.';
  if (details?.name || details?.company) {
    message += `\n\n• Name: ${details.name || '—'}\n• Company: ${details.company || '—'}\n• Headcount: ${details.teamSize || '—'}`;
    if (details?.phone) {
      message += `\n• Phone: ${details.phone}`;
    }
  }
  return `https://wa.me/${hotline}?text=${encodeURIComponent(message)}`;
}
