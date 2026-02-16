import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

interface AuthSession {
  did: string;
  handle: string;
  accessToken: string;
  refreshToken: string;
}

const SESSION_KEY = 'exprsn_session';

export async function signIn(handle: string): Promise<void> {
  // Get the authorization URL from our API
  const response = await fetch(`${API_BASE}/oauth/authorize?handle=${encodeURIComponent(handle)}`);
  const { url } = await response.json();

  // Open the browser for OAuth
  const result = await WebBrowser.openAuthSessionAsync(
    url,
    Linking.createURL('oauth/callback')
  );

  if (result.type === 'success' && result.url) {
    // Handle the callback URL
    const params = new URL(result.url).searchParams;
    const code = params.get('code');
    const state = params.get('state');

    if (code && state) {
      // Exchange code for tokens
      const tokenResponse = await fetch(`${API_BASE}/oauth/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state }),
      });

      const session: AuthSession = await tokenResponse.json();
      await saveSession(session);
    }
  }
}

export async function signOut(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function getSession(): Promise<AuthSession | null> {
  const sessionStr = await SecureStore.getItemAsync(SESSION_KEY);
  if (!sessionStr) return null;

  try {
    return JSON.parse(sessionStr);
  } catch {
    return null;
  }
}

async function saveSession(session: AuthSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function refreshSession(): Promise<AuthSession | null> {
  const session = await getSession();
  if (!session?.refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE}/oauth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });

    if (!response.ok) {
      await signOut();
      return null;
    }

    const newSession: AuthSession = await response.json();
    await saveSession(newSession);
    return newSession;
  } catch {
    return null;
  }
}
