import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAAl32aMY8mZ36PPcB4wZEc4pOkB2qpFDA',
  authDomain: 'modconhr-b2789.firebaseapp.com',
  projectId: 'modconhr-b2789',
  storageBucket: 'modconhr-b2789.firebasestorage.app',
  messagingSenderId: '257832557844',
  appId: '1:257832557844:web:4dcbba495886cabcc7f601',
};

async function updateOrgSettingsAndEmployees() {
  console.log('========================================================================');
  console.log('  UPDATING ORG SETTINGS (WEEK-OFF, HOLIDAYS) & EMPLOYEE WEEK-OFFS');
  console.log('  Org: qazeroorg.test (iOpAEnEkKgqmiVlHhtZn)');
  console.log('========================================================================\n');

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const cred = await signInWithEmailAndPassword(auth, 'mintstudios823@gmail.com', 'Eagleeye@123');
  const uid = cred.user.uid;
  const orgKey = 'iOpAEnEkKgqmiVlHhtZn';

  // 1. Set Org Week-Off to Sunday in org_settings
  console.log('>>> [1/4] Setting org_settings weekOff to "Sunday"...');
  await setDoc(doc(db, 'org_settings', `${orgKey}__weekOff`), {
    orgId: orgKey,
    key: 'weekOff',
    valueJson: JSON.stringify('Sunday'),
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });
  console.log('    ✓ org_settings weekOff set to "Sunday"');

  // 2. Set Org Holidays including 2026 official holidays (and September holidays!)
  console.log('\n>>> [2/4] Setting org_settings holidays (including 2026 September holidays)...');
  const holidays = [
    { id: 'hol-2026-01-26', name: 'Republic Day', date: '2026-01-26', type: 'National' },
    { id: 'hol-2026-03-04', name: 'Holi', date: '2026-03-04', type: 'National' },
    { id: 'hol-2026-04-14', name: 'Ambedkar Jayanti', date: '2026-04-14', type: 'National' },
    { id: 'hol-2026-05-01', name: 'May Day', date: '2026-05-01', type: 'Regional' },
    { id: 'hol-2026-08-15', name: 'Independence Day', date: '2026-08-15', type: 'National' },
    { id: 'hol-2026-09-04', name: 'Janmashtami', date: '2026-09-04', type: 'National' },
    { id: 'hol-2026-09-14', name: 'Ganesh Chaturthi', date: '2026-09-14', type: 'National' },
    { id: 'hol-2026-09-25', name: 'Eid-e-Milad', date: '2026-09-25', type: 'National' },
    { id: 'hol-2026-10-02', name: 'Gandhi Jayanti', date: '2026-10-02', type: 'National' },
    { id: 'hol-2026-10-20', name: 'Dussehra', date: '2026-10-20', type: 'National' },
    { id: 'hol-2026-11-08', name: 'Diwali', date: '2026-11-08', type: 'National' },
    { id: 'hol-2026-12-25', name: 'Christmas Day', date: '2026-12-25', type: 'National' },
  ];

  await setDoc(doc(db, 'org_settings', `${orgKey}__holidays`), {
    orgId: orgKey,
    key: 'holidays',
    valueJson: JSON.stringify(holidays),
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });
  console.log(`    ✓ org_settings holidays set (${holidays.length} holidays configured)`);

  // 3. Update employee records in org_records to ensure standard 2-week-offs or primary Sunday
  console.log('\n>>> [3/4] Updating employee records in org_records with primary & secondary week-offs...');
  const empSnap = await getDocs(query(collection(db, 'org_records'), where('orgId', '==', orgKey), where('store', '==', 'employees')));
  const batch = writeBatch(db);
  empSnap.forEach((docSnap) => {
    const rawData = docSnap.data();
    const emp = rawData.data ? JSON.parse(rawData.data) : rawData;
    // Standard 5-day work week employees: Sunday primary, Saturday secondary
    emp.weekOff = 'Sunday';
    emp.weekOff2 = 'Saturday';
    batch.update(docSnap.ref, {
      data: JSON.stringify(emp),
      updatedAt: serverTimestamp(),
    });
    console.log(`    ✓ Updated ${emp.fullName} (${emp.id}): weekOff=Sunday, weekOff2=Saturday`);
  });
  await batch.commit();

  // 4. Update September attendance records:
  // If an attendance record exists for holidays or week-offs that says 'Absent', clean it up
  console.log('\n>>> [4/4] Verifying and cleaning any anomalous absent records on week-offs/holidays...');
  const attSnap = await getDocs(query(collection(db, 'org_records'), where('orgId', '==', orgKey), where('store', '==', 'attendanceRecords')));
  const attBatch = writeBatch(db);
  let cleanedCount = 0;
  attSnap.forEach((docSnap) => {
    const attData = docSnap.data();
    const rec = attData.data ? JSON.parse(attData.data) : attData;
    if (rec && rec.date && rec.date.startsWith('2026-09')) {
      const d = new Date(rec.date);
      const isSun = d.getUTCDay() === 0;
      if (isSun && rec.status === 'Absent') {
        attBatch.delete(docSnap.ref);
        cleanedCount++;
      }
    }
  });
  if (cleanedCount > 0) {
    await attBatch.commit();
    console.log(`    ✓ Cleaned ${cleanedCount} erroneous Sunday absent records from Firestore`);
  } else {
    console.log('    ✓ No erroneous Sunday absent records in Firestore');
  }

  console.log('\n✅ ALL ORG SETTINGS & EMPLOYEE ROSTER CONFIGURATION SYNCHRONIZED SUCCESSFULLY!');
}

updateOrgSettingsAndEmployees().catch(console.error);
