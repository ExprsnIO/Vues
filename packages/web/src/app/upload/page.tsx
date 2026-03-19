'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUploadDraftStore } from '@/stores/upload-draft-store';
import { UploadWizardProgress } from '@/components/upload/UploadWizardProgress';
import { Step1VideoSelection } from '@/components/upload/Step1VideoSelection';
import { Step2EditDetails } from '@/components/upload/Step2EditDetails';
import { Step3CoverImage } from '@/components/upload/Step3CoverImage';
import { Step4Settings } from '@/components/upload/Step4Settings';
import { Step5Review } from '@/components/upload/Step5Review';
import { DraftsModal } from '@/components/upload/DraftsModal';
import toast from 'react-hot-toast';

export default function UploadPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading: isAuthLoading } = useAuth();

  const {
    currentDraft,
    createDraft,
    updateDraft,
    loadDraft,
    clearCurrentDraft,
    setCurrentStep,
    markStepCompleted,
    getAllDrafts,
  } = useUploadDraftStore();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [showDraftsModal, setShowDraftsModal] = useState(false);

  const drafts = getAllDrafts();
  const currentStep = currentDraft?.currentStep || 0;

  // Initialize or restore draft
  useEffect(() => {
    if (!currentDraft) {
      // Check if there are existing drafts
      if (drafts.length === 0) {
        // Create new draft
        createDraft();
      }
    }
  }, []);

  // Save draft indicator
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  useEffect(() => {
    if (currentDraft) {
      setLastSaved(new Date());
    }
  }, [currentDraft]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !currentDraft) throw new Error('No file selected');

      // Step 1: Get presigned upload URL
      const { uploadId, uploadUrl } = await api.getUploadUrl(file.type);

      // Step 2: Upload file directly to S3
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error('Upload failed'));
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // Step 3: Trigger processing
      setProcessingStatus('Processing video...');
      await api.completeUpload(uploadId);

      // Step 4: Poll for processing status
      let status = 'processing';
      while (status === 'processing' || status === 'pending') {
        await new Promise((r) => setTimeout(r, 2000));
        const result = await api.getUploadStatus(uploadId);
        status = result.status;
        if (status === 'failed') {
          throw new Error(result.error || 'Processing failed');
        }
      }

      // Step 5: Get video metadata
      const video = document.createElement('video');
      video.src = previewUrl!;
      await new Promise((r) => (video.onloadedmetadata = r));

      // Step 6: Create post
      setProcessingStatus('Publishing...');
      const result = await api.createPost({
        uploadId,
        caption: `${currentDraft.title}\n\n${currentDraft.description}`,
        tags: currentDraft.tags,
        visibility: currentDraft.visibility === 'followers' ? 'followers' : 'public',
        aspectRatio: {
          width: video.videoWidth,
          height: video.videoHeight,
        },
        duration: Math.round(video.duration),
      });

      return result;
    },
    onSuccess: () => {
      toast.success('Video published successfully!');
      clearCurrentDraft();
      router.push('/');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Upload failed');
    },
  });

  // Handle file selection
  const handleFileSelect = useCallback(
    (selectedFile: File, preview: string) => {
      setFile(selectedFile);
      setPreviewUrl(preview);

      if (!currentDraft) {
        const draftId = createDraft(selectedFile);
      } else {
        updateDraft({
          file: {
            name: selectedFile.name,
            size: selectedFile.size,
            type: selectedFile.type,
            lastModified: selectedFile.lastModified,
          },
          previewUrl: preview,
        });
      }
    },
    [currentDraft, createDraft, updateDraft]
  );

  // Handle step navigation
  const handleNextStep = useCallback(() => {
    if (currentStep < 4) {
      markStepCompleted(currentStep);
      setCurrentStep(currentStep + 1);
    }
  }, [currentStep, markStepCompleted, setCurrentStep]);

  const handleBackStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep, setCurrentStep]);

  const handleJumpToStep = useCallback(
    (step: number) => {
      if (step <= currentStep || currentDraft?.completedSteps.includes(step)) {
        setCurrentStep(step);
      }
    },
    [currentStep, currentDraft, setCurrentStep]
  );

  // Handle draft loading
  const handleLoadDraft = useCallback(
    (draftId: string) => {
      loadDraft(draftId);
      const draft = drafts.find((d) => d.id === draftId);
      if (draft?.previewUrl) {
        // Note: PreviewUrl from localStorage might not be valid
        // In production, you'd need to handle this differently
        setPreviewUrl(draft.previewUrl);
      }
    },
    [loadDraft, drafts]
  );

  // Redirect if not logged in
  if (!isAuthLoading && !user) {
    router.push('/login');
    return null;
  }

  if (!currentDraft) {
    return (
      <div className="flex min-h-screen bg-black">
        <Sidebar />
        <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        {/* Progress Indicator */}
        <UploadWizardProgress
          currentStep={currentStep}
          completedSteps={currentDraft.completedSteps}
          onStepClick={handleJumpToStep}
        />

        {/* Auto-save indicator */}
        {lastSaved && (
          <div className="fixed top-4 right-4 z-40 px-3 py-2 bg-zinc-800/90 backdrop-blur-sm rounded-lg border border-zinc-700 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-300">
              Draft saved {lastSaved.toLocaleTimeString()}
            </span>
          </div>
        )}

        {/* Step Content */}
        <div className="pb-8">
          {currentStep === 0 && (
            <Step1VideoSelection
              file={file}
              previewUrl={previewUrl}
              onFileSelect={handleFileSelect}
              onNext={handleNextStep}
              onLoadDraft={() => setShowDraftsModal(true)}
              hasDrafts={drafts.length > 1}
            />
          )}

          {currentStep === 1 && (
            <Step2EditDetails
              title={currentDraft.title}
              description={currentDraft.description}
              tags={currentDraft.tags}
              onUpdate={({ title, description, tags }) => {
                updateDraft({ title, description, tags });
              }}
              onNext={handleNextStep}
              onBack={handleBackStep}
            />
          )}

          {currentStep === 2 && previewUrl && (
            <Step3CoverImage
              videoUrl={previewUrl}
              coverImage={currentDraft.coverImage ? { ...currentDraft.coverImage, data: currentDraft.coverImage.data ?? '' } : null}
              onUpdate={(coverImage) => {
                updateDraft({ coverImage });
              }}
              onNext={handleNextStep}
              onBack={handleBackStep}
            />
          )}

          {currentStep === 3 && (
            <Step4Settings
              visibility={currentDraft.visibility}
              allowComments={currentDraft.allowComments}
              allowDuets={currentDraft.allowDuets}
              allowStitches={currentDraft.allowStitches}
              onUpdate={(settings) => {
                updateDraft(settings);
              }}
              onNext={handleNextStep}
              onBack={handleBackStep}
            />
          )}

          {currentStep === 4 && file && previewUrl && (
            <Step5Review
              file={file}
              previewUrl={previewUrl}
              title={currentDraft.title}
              description={currentDraft.description}
              tags={currentDraft.tags}
              coverImage={currentDraft.coverImage ? { ...currentDraft.coverImage, data: currentDraft.coverImage.data ?? '' } : null}
              visibility={currentDraft.visibility}
              allowComments={currentDraft.allowComments}
              allowDuets={currentDraft.allowDuets}
              allowStitches={currentDraft.allowStitches}
              uploadProgress={uploadProgress}
              processingStatus={processingStatus}
              isUploading={uploadMutation.isPending}
              error={
                uploadMutation.error instanceof Error
                  ? uploadMutation.error.message
                  : null
              }
              onPublish={() => uploadMutation.mutate()}
              onBack={handleBackStep}
              onEdit={handleJumpToStep}
            />
          )}
        </div>
      </main>

      {/* Drafts Modal */}
      <DraftsModal
        isOpen={showDraftsModal}
        onClose={() => setShowDraftsModal(false)}
        onLoadDraft={handleLoadDraft}
      />
    </div>
  );
}
