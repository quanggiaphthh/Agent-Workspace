import { auth } from './firebase';

/**
 * Custom fetch wrapper that automatically injects the Firebase ID Token
 * into the Authorization Bearer header.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  
  // Phase 1: Wait for auth state to resolve
  await auth.authStateReady();
  const user = auth.currentUser;

  if (user) {
    try {
      const token = await user.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    } catch (err) {
      console.error('Failed to get Firebase ID token for authFetch', err);
    }
  } else {
    // If we have no user, we might be calling a protected route.
    // However, authFetch is generic. We'll proceed but without the header.
    // If the server requires auth, it will return 401.
    console.warn('[authFetch] No user detected after authReady');
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
