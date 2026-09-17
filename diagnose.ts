import { adminFirestore, firebaseAdminConfig } from './server/lib/firebaseAdmin';

async function runProbe() {
  console.log('--- DIAGNOSTIC PROBE ---');
  console.log('Config:', JSON.stringify(firebaseAdminConfig, null, 2));
  
  try {
    const principal = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', {
      headers: { 'Metadata-Flavor': 'Google' }
    });
    console.log('Principal:', await principal.text());
  } catch (e) {
    console.log('Principal: Could not determine (not running in GCP?)');
  }

  const sessionId = `probe_${Date.now()}`;
  const testDocRef = adminFirestore.collection('_server_probe').doc(sessionId);

  try {
    console.log('Attempting write...');
    await testDocRef.set({ test: 'data' });
    console.log('Attempting read...');
    await testDocRef.get();
    console.log('Attempting delete...');
    await testDocRef.delete();
    console.log('Probe result: PASS');
  } catch (err: any) {
    console.error('Probe result: FAIL');
    console.error('Error:', err.message);
  }
}

runProbe();
