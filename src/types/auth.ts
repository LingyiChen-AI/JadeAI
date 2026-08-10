export interface AppUser {
  id: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  fingerprint?: string | null;
  authType: 'oauth' | 'fingerprint' | 'local';
}

export interface AuthState {
  user: AppUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
