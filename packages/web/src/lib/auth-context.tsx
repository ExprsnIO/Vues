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
  type CertificateData,
  type AccountType,
  type CreateAccountResult,
} from './auth';
import { api } from './api';

export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'support' | null;

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

interface SignUpResult {
  did: string;
  handle: string;
  certificate?: CertificateData;
  apiToken?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // Admin/moderator role
  adminRole: AdminRole;
  adminPermissions: string[];
  isModerator: boolean;
  isAdmin: boolean;
  // Local auth methods
  signUp: (data: {
    handle: string;
    email: string;
    password: string;
    displayName?: string;
    accountType?: AccountType;
    didMethod?: 'plc' | 'web' | 'exprn';
  }) => Promise<SignUpResult>;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  // OAuth methods
  signInWithOAuth: (handle: string) => Promise<void>;
  // Utility
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const MODERATOR_ROLES: AdminRole[] = ['moderator', 'admin', 'super_admin'];
const ADMIN_ROLES: AdminRole[] = ['admin', 'super_admin'];

async function fetchAdminRole(): Promise<{ role: AdminRole; permissions: string[] }> {
  try {
    const session = await api.getAdminSession();
    if (session?.admin) {
      return {
        role: session.admin.role as AdminRole,
        permissions: session.admin.permissions ?? [],
      };
    }
  } catch {
    // 403 or network error — user is not an admin, silently ignore
  }
  return { role: null, permissions: [] };
}

export const AuthProvider: FC<PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [adminRole, setAdminRole] = useState<AdminRole>(null);
  const [adminPermissions, setAdminPermissions] = useState<string[]>([]);

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

          // Background: check admin role (non-blocking)
          fetchAdminRole().then(({ role, permissions }) => {
            setAdminRole(role);
            setAdminPermissions(permissions);
          });

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

          // Background: check admin role (non-blocking)
          fetchAdminRole().then(({ role, permissions }) => {
            setAdminRole(role);
            setAdminPermissions(permissions);
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
    accountType?: AccountType;
    didMethod?: 'plc' | 'web' | 'exprn';
  }): Promise<SignUpResult> => {
    const result = await createAccount(data);
    api.setSession(result.accessJwt);
    setToken(result.accessJwt);
    setUser({
      did: result.did,
      handle: result.handle,
      displayName: result.user?.displayName,
      avatar: result.user?.avatar,
    });

    return {
      did: result.did,
      handle: result.handle,
      certificate: result.certificate,
      apiToken: result.apiToken,
    };
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

    // Background: check admin role after sign-in
    fetchAdminRole().then(({ role, permissions }) => {
      setAdminRole(role);
      setAdminPermissions(permissions);
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
    setAdminRole(null);
    setAdminPermissions([]);
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

  const isModerator = MODERATOR_ROLES.includes(adminRole);
  const isAdmin = ADMIN_ROLES.includes(adminRole);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        adminRole,
        adminPermissions,
        isModerator,
        isAdmin,
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
