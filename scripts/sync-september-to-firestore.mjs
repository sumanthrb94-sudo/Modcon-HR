import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, writeBatch, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAAl32aMY8mZ36PPcB4wZEc4pOkB2qpFDA',
  authDomain: 'modconhr-b2789.firebaseapp.com',
  projectId: 'modconhr-b2789',
  storageBucket: 'modconhr-b2789.firebasestorage.app',
  messagingSenderId: '257832557844',
  appId: '1:257832557844:web:4dcbba495886cabcc7f601',
};

async function syncToFirestore() {
  console.log('========================================================================');
  console.log('  COMMITTING SEPTEMBER 2026 ATTENDANCE & REGULARIZATION TO FIRESTORE');
  console.log('  Org: qazeroorg.test (iOpAEnEkKgqmiVlHhtZn)');
  console.log('========================================================================\n');

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log('>>> [1/3] Authenticating as Asha Rao (mintstudios823@gmail.com)...');
  const userCred = await signInWithEmailAndPassword(auth, 'mintstudios823@gmail.com', 'Eagleeye@123');
  console.log('    ✓ Signed in as UID:', userCred.user.uid);

  const orgKey = 'iOpAEnEkKgqmiVlHhtZn';

  // 5 Active Employees in qazeroorg.test
  const employees = [
    { id: 'emp-001', code: 'MC-001', name: 'Rahul Mehta', managerId: null },
    { id: 'emp-002', code: 'MC-002', name: 'Priya Nair', managerId: null },
    { id: 'emp-003', code: 'MC-003', name: 'Karthik Reddy', managerId: 'emp-002' },
    { id: 'emp-004', code: 'MC-004', name: 'Meera Iyer', managerId: null },
    { id: 'emp-005', code: 'MC-005', name: 'Sanjay Kumar', managerId: null },
  ];

  console.log('\n>>> [2/3] Generating complete September 2026 attendance & regularizations...');
  
  // September 2026 dates (1 to 30)
  const dates = [];
  for (let d = 1; d <= 30; d++) {
    const dStr = d < 10 ? `0${d}` : `${d}`;
    dates.push(`2026-09-${dStr}`);
  }

  // Firestore allows up to 500 writes per batch
  let batch = writeBatch(db);
  let batchCount = 0;
  let totalCommitted = 0;

  async function flushBatch() {
    if (batchCount > 0) {
      await batch.commit();
      totalCommitted += batchCount;
      console.log(`    ✓ Committed batch of ${batchCount} records to Firestore (Total: ${totalCommitted}).`);
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  for (const emp of employees) {
    for (const date of dates) {
      const dObj = new Date(date);
      const dayOfWeek = dObj.getUTCDay(); // 0 = Sun

      // Sunday is week off
      if (dayOfWeek === 0) continue;

      // Official Holidays in September 2026 (Janmashtami, Ganesh Chaturthi, Eid-e-Milad)
      if (date === '2026-09-04' || date === '2026-09-14' || date === '2026-09-25') continue;

      const isWFH = (dayOfWeek === 6) || (emp.id === 'emp-003' && dayOfWeek === 3);
      const status = isWFH ? 'Work From Home' : 'Present';
      const checkIn = isWFH ? '09:05' : '08:58';
      const checkOut = isWFH ? '18:05' : '18:02';
      const workedHours = 9.0;
      const recId = `att-${emp.id}-${date}`;

      const record = {
        id: recId,
        employeeId: emp.id,
        date,
        status,
        checkIn,
        checkOut,
        workedHours,
        shift: 'General Shift (09:00 – 18:00)',
        isLate: false,
      };

      const readableBy = emp.managerId ? [emp.id, emp.managerId] : [emp.id];

      // Write attendance record
      const attDocRef = doc(db, 'org_records', `${orgKey}__attendanceRecords__${recId}`);
      batch.set(attDocRef, {
        orgId: orgKey,
        store: 'attendanceRecords',
        recordId: recId,
        deleted: false,
        data: JSON.stringify(record),
        employeeId: emp.id,
        status,
        readableBy,
      });
      batchCount++;

      if (batchCount >= 450) {
        await flushBatch();
      }

      // Add regularization requests for mid-month auditing days
      if (date === '2026-09-08' || date === '2026-09-15' || date === '2026-09-22') {
        const regId = `reg-${emp.id}-${date}`;
        const regRecord = {
          id: regId,
          employeeId: emp.id,
          date,
          reason: 'Biometric sync regularization for September working cycle',
          requestedStatus: status,
          status: 'Approved',
        };

        const regDocRef = doc(db, 'org_records', `${orgKey}__regularizationOverrides__${regId}`);
        batch.set(regDocRef, {
          orgId: orgKey,
          store: 'regularizationOverrides',
          recordId: regId,
          deleted: false,
          data: JSON.stringify(regRecord),
          employeeId: emp.id,
          status: 'Approved',
          readableBy,
        });
        batchCount++;

        if (batchCount >= 450) {
          await flushBatch();
        }
      }
    }
  }

  await flushBatch();

  console.log('\n>>> [3/3] Done! Total Firestore documents committed:', totalCommitted);
  process.exit(0);
}

syncToFirestore().catch(err => {
  console.error('Firestore sync error:', err);
  process.exit(1);
});
