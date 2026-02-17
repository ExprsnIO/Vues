'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import Link from 'next/link';

interface LoginModalContextType {
  isOpen: boolean;
  message?: string;
  open: (message?: string) => void;
  close: () => void;
}

const LoginModalContext = createContext<LoginModalContextType>({
  isOpen: false,
  open: () => {},
  close: () => {},
});

export function useLoginModal() {
  return useContext(LoginModalContext);
}

export function LoginModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState<string>();

  const open = useCallback((msg?: string) => {
    setMessage(msg);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setMessage(undefined);
  }, []);

  return (
    <LoginModalContext.Provider value={{ isOpen, message, open, close }}>
      {children}
      {isOpen && <LoginModal message={message} onClose={close} />}
    </LoginModalContext.Provider>
  );
}

interface LoginModalProps {
  message?: string;
  onClose: () => void;
}

function LoginModal({ message, onClose }: LoginModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-background-alt border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-accent to-accent-hover rounded-2xl flex items-center justify-center">
            <span className="text-text-inverse font-bold text-3xl">E</span>
          </div>
        </div>

        {/* Content */}
        <h2 className="text-xl font-bold text-text-primary text-center mb-2">
          Log in to continue
        </h2>
        <p className="text-text-muted text-center mb-6">
          {message || 'You need to be logged in to perform this action.'}
        </p>

        {/* Buttons */}
        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full py-3 bg-accent hover:bg-accent-hover text-text-inverse font-medium text-center rounded-lg transition-colors"
          >
            Log in
          </Link>
          <button
            onClick={onClose}
            className="block w-full py-3 bg-surface hover:bg-surface-hover text-text-primary font-medium text-center rounded-lg transition-colors"
          >
            Not now
          </button>
        </div>

        {/* Sign up link */}
        <p className="text-center text-text-muted text-sm mt-6">
          Don't have an account?{' '}
          <Link href="/login" className="text-accent hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
