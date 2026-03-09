'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface TipModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipient: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  videoUri?: string;
}

const TIP_AMOUNTS = [
  { value: 100, label: '$1' },
  { value: 500, label: '$5' },
  { value: 1000, label: '$10' },
  { value: 2500, label: '$25' },
];

export function TipModal({ isOpen, onClose, recipient, videoUri }: TipModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<'amount' | 'confirm' | 'success'>('amount');

  const tipMutation = useMutation({
    mutationFn: () => {
      const amount = selectedAmount || (parseFloat(customAmount) * 100);
      return api.tip({
        recipientDid: recipient.did,
        amount,
        message: message || undefined,
        videoUri,
      });
    },
    onSuccess: () => {
      setStep('success');
      toast.success(`Tip sent to @${recipient.handle}!`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send tip');
    },
  });

  const handleClose = () => {
    setSelectedAmount(null);
    setCustomAmount('');
    setMessage('');
    setStep('amount');
    onClose();
  };

  const getAmount = () => {
    if (selectedAmount) return selectedAmount;
    const parsed = parseFloat(customAmount);
    return isNaN(parsed) ? 0 : parsed * 100;
  };

  const formatAmount = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative bg-gray-900 rounded-2xl w-full max-w-md mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">
            {step === 'success' ? 'Tip Sent!' : 'Send a Tip'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Recipient info */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            {recipient.avatar ? (
              <img
                src={recipient.avatar}
                alt={recipient.handle}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold">
                {recipient.handle[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-white font-medium">
                {recipient.displayName || `@${recipient.handle}`}
              </p>
              {recipient.displayName && (
                <p className="text-gray-400 text-sm">@{recipient.handle}</p>
              )}
            </div>
          </div>
        </div>

        {step === 'amount' && (
          <>
            {/* Amount selection */}
            <div className="p-4 space-y-4">
              <p className="text-gray-400 text-sm">Select an amount</p>
              <div className="grid grid-cols-4 gap-2">
                {TIP_AMOUNTS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => {
                      setSelectedAmount(value);
                      setCustomAmount('');
                    }}
                    className={`py-3 rounded-lg font-medium transition-colors ${
                      selectedAmount === value
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number"
                  placeholder="Custom amount"
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                    setSelectedAmount(null);
                  }}
                  className="w-full pl-7 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  min="1"
                  step="0.01"
                />
              </div>

              <textarea
                placeholder="Add a message (optional)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                rows={2}
                maxLength={200}
              />
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800">
              <button
                onClick={() => setStep('confirm')}
                disabled={getAmount() < 100}
                className="w-full py-3 bg-primary-500 text-white font-semibold rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continue
              </button>
              <p className="mt-2 text-center text-gray-500 text-xs">
                Minimum tip: $1.00
              </p>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div className="p-6 space-y-4">
              <div className="text-center">
                <p className="text-gray-400 text-sm">You're about to send</p>
                <p className="text-4xl font-bold text-white mt-2">
                  {formatAmount(getAmount())}
                </p>
                <p className="text-gray-400 text-sm mt-2">
                  to @{recipient.handle}
                </p>
              </div>

              {message && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">Your message:</p>
                  <p className="text-white text-sm">{message}</p>
                </div>
              )}

              <p className="text-gray-500 text-xs text-center">
                A 5% platform fee will be deducted from tips.
              </p>
            </div>

            <div className="p-4 border-t border-gray-800 flex gap-3">
              <button
                onClick={() => setStep('amount')}
                className="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => tipMutation.mutate()}
                disabled={tipMutation.isPending}
                className="flex-1 py-3 bg-primary-500 text-white font-semibold rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {tipMutation.isPending ? 'Sending...' : 'Send Tip'}
              </button>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-xl font-semibold text-white">Thank you!</p>
              <p className="text-gray-400 mt-2">
                Your {formatAmount(getAmount())} tip has been sent to @{recipient.handle}
              </p>
            </div>

            <div className="p-4 border-t border-gray-800">
              <button
                onClick={handleClose}
                className="w-full py-3 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
