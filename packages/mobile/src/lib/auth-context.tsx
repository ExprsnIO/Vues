import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { getSession, signIn as authSignIn, signOut as authSignOut } from './auth';

interface User {
  did: string;
  handle: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (handle: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const session = await getSession();
        if (session) {
          setUser({
            did: session.did,
            handle: session.handle,
          });
        }
      } catch (error) {
        console.error('Failed to get session:', error);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const signIn = async (handle: string) => {
    await authSignIn(handle);
    const session = await getSession();
    if (session) {
      setUser({
        did: session.did,
        handle: session.handle,
      });
    }
  };

  const signOut = async () => {
    await authSignOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
