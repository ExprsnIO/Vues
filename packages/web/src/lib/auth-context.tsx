'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type FC,
  type PropsWithChildren,
} from 'react';
import {
  getSession as getOAuthSession,
  signIn as oauthSignIn,
  signOut as oauthSignOut,
  getLocalSession,
  signInLocal,
  signOutLocal,
  createAccount,
  getLocalUser,
  refreshLocalSession,
  type LocalSession,
  type LocalUser,
} from './auth';
import { api } from './api';

export interface SocialLinks {
  twitter?: string;
  instagram?: string;
  youtube?: string;
  tiktok?: string;
  discord?: string;
}

export interface User {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  bio?: string;
  location?: string;
  website?: string;
  socialLinks?: SocialLinks;
  followerCount?: number;
  followingCount?: number;
  videoCount?: number;
  verified?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // Local auth methods
  signUp: (data: {
    handle: string;
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  // OAuth methods
  signInWithOAuth: (handle: string) => Promise<void>;
  // Utility
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: FC<PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session on mount
  useEffect(() => {
    async function init() {
      try {
        // Check for local session first
        const localSession = getLocalSession();
        if (localSession) {
          // Set API token
          api.setSession(localSession.accessJwt);
          setToken(localSession.accessJwt);

          // Get user info from session or fetch fresh
          const localUser = getLocalUser();
          if (localUser) {
            setUser({
              did: localUser.did,
              handle: localUser.handle,
              displayName: localUser.displayName,
              avatar: localUser.avatar,
            });
          } else {
            // Fetch user profile from API
            try {
              const { profile } = await api.getActorProfile(localSession.did);
              setUser({
                did: profile.did,
                handle: profile.handle,
                displayName: profile.displayName,
                avatar: profile.avatar,
                bio: profile.bio,
                followerCount: profile.followerCount,
                followingCount: profile.followingCount,
                videoCount: profile.videoCount,
                verified: profile.verified,
              });
            } catch {
              // Session might be invalid, try to refresh
              const refreshed = await refreshLocalSession();
              if (!refreshed) {
                await signOutLocal();
                setToken(null);
              } else {
                setToken(refreshed.accessJwt);
              }
            }
          }
          setIsLoading(false);
          return;
        }

        // Check for OAuth session
        const oauthSession = await getOAuthSession();
        if (oauthSession) {
          setUser({
            did: oauthSession.did,
            handle: oauthSession.handle,
          });
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const signUp = useCallback(async (data: {
    handle: string;
    email: string;
    password: string;
    displayName?: string;
  }) => {
    const session = await createAccount(data);
    api.setSession(session.accessJwt);
    setToken(session.accessJwt);
    setUser({
      did: session.did,
      handle: session.handle,
      displayName: session.user?.displayName,
      avatar: session.user?.avatar,
    });
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const session = await signInLocal(identifier, password);
    api.setSession(session.accessJwt);
    setToken(session.accessJwt);
    setUser({
      did: session.did,
      handle: session.handle,
      displayName: session.user?.displayName,
      avatar: session.user?.avatar,
    });
  }, []);

  const signOut = useCallback(async () => {
    // Try local signout first
    const localSession = getLocalSession();
    if (localSession) {
      await signOutLocal();
      api.setSession(null);
    } else {
      // OAuth signout
      await oauthSignOut();
    }
    setToken(null);
    setUser(null);
  }, []);

  const signInWithOAuth = useCallback(async (handle: string) => {
    await oauthSignIn(handle);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!user) return;

    try {
      const { profile } = await api.getActorProfile(user.did);
      setUser({
        did: profile.did,
        handle: profile.handle,
        displayName: profile.displayName,
        avatar: profile.avatar,
        bio: profile.bio,
        followerCount: profile.followerCount,
        followingCount: profile.followingCount,
        videoCount: profile.videoCount,
        verified: profile.verified,
      });
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        signUp,
        signIn,
        signOut,
        signInWithOAuth,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Hook for requiring authentication
export function useRequireAuth(redirectTo: string = '/login') {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = redirectTo;
    }
  }, [user, isLoading, redirectTo]);

  return { user, isLoading, isAuthenticated: !!user };
}
