'use client';

import { ReactNode } from 'react';
import { Modal, ModalBody, ModalFooter } from './Modal';

type ConfirmVariant = 'default' | 'danger' | 'warning';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  isLoading?: boolean;
  icon?: ReactNode;
}

const variantStyles: Record<ConfirmVariant, { button: string; iconBg: string }> = {
  default: {
    button: 'bg-accent hover:bg-accent-hover text-text-inverse',
    iconBg: 'bg-accent/10',
  },
  danger: {
    button: 'bg-red-500 hover:bg-red-600 text-white',
    iconBg: 'bg-red-500/10',
  },
  warning: {
    button: 'bg-yellow-500 hover:bg-yellow-600 text-white',
    iconBg: 'bg-yellow-500/10',
  },
};

const defaultIcons: Record<ConfirmVariant, ReactNode> = {
  default: (
    <svg
      className="w-6 h-6 text-accent"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  danger: (
    <svg
      className="w-6 h-6 text-red-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  ),
  warning: (
    <svg
      className="w-6 h-6 text-yellow-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
  icon,
}: ConfirmDialogProps) {
  const styles = variantStyles[variant];
  const displayIcon = icon || defaultIcons[variant];

  const handleConfirm = () => {
    if (!isLoading) {
      onConfirm();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      showCloseButton={false}
      closeOnOverlayClick={!isLoading}
    >
      <ModalBody>
        <div className="flex flex-col items-center text-center">
          {displayIcon && (
            <div
              className={`w-12 h-12 rounded-full ${styles.iconBg} flex items-center justify-center mb-4`}
            >
              {displayIcon}
            </div>
          )}
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            {title}
          </h3>
          <div className="text-sm text-text-muted">{message}</div>
        </div>
      </ModalBody>
      <ModalFooter className="justify-center">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          onClick={handleConfirm}
          disabled={isLoading}
          className={`px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles.button}`}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Processing...
            </span>
          ) : (
            confirmLabel
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// Delete confirmation preset
interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName?: string;
  itemType?: string;
  isLoading?: boolean;
}

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  itemType = 'item',
  isLoading = false,
}: DeleteConfirmDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={`Delete ${itemType}?`}
      message={
        <>
          {itemName ? (
            <>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-text-primary">{itemName}</span>
              ? This action cannot be undone.
            </>
          ) : (
            <>
              Are you sure you want to delete this {itemType}? This action cannot
              be undone.
            </>
          )}
        </>
      }
      confirmLabel="Delete"
      variant="danger"
      isLoading={isLoading}
    />
  );
}
