import { adminFirestore } from '../../lib/firebaseAdmin';

export interface CredentialEntry {
  id: string;
  userId: string;
  providerId: string;
  name: string; // e.g. "My Personal Key"
  key: string; // Secret!
  createdAt: string;
}

export class CredentialService {
  private static getCollection(userId: string) {
    return adminFirestore
      .collection('users')
      .doc(userId)
      .collection('credentials');
  }

  public static async saveCredential(userId: string, providerId: string, key: string, name: string): Promise<string> {
    const col = this.getCollection(userId);
    const id = `cred_${Math.random().toString(36).substring(2, 9)}`;
    
    await col.doc(id).set({
      id,
      userId,
      providerId,
      name,
      key, // In a production app, encrypt this!
      createdAt: new Date().toISOString()
    });
    
    return id;
  }

  public static async getCredential(userId: string, credentialId: string): Promise<CredentialEntry | null> {
    if (credentialId === 'system') {
      return {
        id: 'system',
        userId: 'system',
        providerId: 'google',
        name: 'System Default',
        key: process.env.GEMINI_API_KEY || '',
        createdAt: ''
      };
    }

    const doc = await this.getCollection(userId).doc(credentialId).get();
    if (!doc.exists) return null;
    return doc.data() as CredentialEntry;
  }

  public static async listCredentials(userId: string): Promise<Omit<CredentialEntry, 'key'>[]> {
    const snapshot = await this.getCollection(userId).get();
    return snapshot.docs.map(doc => {
      const data = doc.data();
      const { key, ...rest } = data;
      return rest as Omit<CredentialEntry, 'key'>;
    });
  }

  public static async listFullCredentials(userId: string, providerId: string): Promise<CredentialEntry[]> {
    const snapshot = await this.getCollection(userId).where('providerId', '==', providerId).get();
    return snapshot.docs.map(doc => doc.data() as CredentialEntry);
  }

  public static async deleteCredential(userId: string, credentialId: string): Promise<void> {
    await this.getCollection(userId).doc(credentialId).delete();
  }
}
