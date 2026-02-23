'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import toast from 'react-hot-toast';

// Aspect ratio presets
const ASPECT_RATIOS = [
  { id: '9:16', label: 'Vertical (9:16)', width: 1080, height: 1920, icon: '📱' },
  { id: '16:9', label: 'Horizontal (16:9)', width: 1920, height: 1080, icon: '🖥️' },
  { id: '1:1', label: 'Square (1:1)', width: 1080, height: 1080, icon: '⬜' },
  { id: '4:5', label: 'Portrait (4:5)', width: 1080, height: 1350, icon: '📷' },
];

export default function EditorDashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);

  // Fetch user's projects
  const { data, isLoading, error } = useQuery({
    queryKey: ['studio', 'projects'],
    queryFn: () => api.listStudioProjects({ limit: 50 }),
    enabled: !!user,
  });

  // Create project mutation
  const createMutation = useMutation({
    mutationFn: (data: { title: string; settings?: { width?: number; height?: number; frameRate?: number; duration?: number; aspectRatio?: string; backgroundColor?: string } }) =>
      api.createStudioProject(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['studio', 'projects'] });
      router.push(`/editor/${result.projectId}`);
      toast.success('Project created!');
    },
    onError: () => toast.error('Failed to create project'),
  });

  // Delete project mutation
  const deleteMutation = useMutation({
    mutationFn: api.deleteStudioProject.bind(api),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio', 'projects'] });
      toast.success('Project deleted');
    },
    onError: () => toast.error('Failed to delete project'),
  });

  // Duplicate project mutation
  const duplicateMutation = useMutation({
    mutationFn: ({ projectId, newName }: { projectId: string; newName?: string }) =>
      api.duplicateStudioProject(projectId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio', 'projects'] });
      toast.success('Project duplicated');
    },
    onError: () => toast.error('Failed to duplicate project'),
  });

  // Redirect to login if not authenticated
  if (!authLoading && !user) {
    router.push('/login?redirect=/editor');
    return null;
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Studio</h1>
            <p className="text-text-muted mt-1">Create and edit your video projects</p>
          </div>
          <button
            onClick={() => setShowNewProjectModal(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <PlusIcon className="w-5 h-5" />
            New Project
          </button>
        </div>

        {/* Projects Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-surface border border-border rounded-xl overflow-hidden animate-pulse">
                <div className="aspect-video bg-surface-hover" />
                <div className="p-4 space-y-2">
                  <div className="h-5 bg-surface-hover rounded w-2/3" />
                  <div className="h-4 bg-surface-hover rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-red-500 mb-4">Failed to load projects</p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['studio', 'projects'] })}
              className="text-accent hover:underline"
            >
              Try again
            </button>
          </div>
        ) : data?.projects?.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-accent/10 flex items-center justify-center">
              <VideoIcon className="w-10 h-10 text-accent" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">No projects yet</h2>
            <p className="text-text-muted mb-6">Create your first video project to get started</p>
            <button
              onClick={() => setShowNewProjectModal(true)}
              className="px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
            >
              Create Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {data?.projects?.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => router.push(`/editor/${project.id}`)}
                onDuplicate={() => duplicateMutation.mutate({ projectId: project.id })}
                onDelete={() => {
                  if (confirm('Are you sure you want to delete this project?')) {
                    deleteMutation.mutate(project.id);
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* New Project Modal */}
        {showNewProjectModal && (
          <NewProjectModal
            onClose={() => setShowNewProjectModal(false)}
            onCreate={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
          />
        )}
      </main>
    </div>
  );
}

// Project Card Component
function ProjectCard({
  project,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  project: {
    id: string;
    title: string;
    settings: {
      width: number;
      height: number;
      frameRate: number;
      duration: number;
      aspectRatio?: string;
    };
    createdAt: string;
    updatedAt: string;
  };
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const aspectRatio = project.settings.aspectRatio || `${project.settings.width}:${project.settings.height}`;
  const durationSeconds = project.settings.duration / project.settings.frameRate;
  const formattedDuration = `${Math.floor(durationSeconds / 60)}:${String(Math.floor(durationSeconds % 60)).padStart(2, '0')}`;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden group hover:border-accent/50 transition-colors">
      {/* Thumbnail */}
      <div
        className="relative cursor-pointer"
        onClick={onOpen}
        style={{
          aspectRatio: project.settings.width / project.settings.height > 1 ? '16/9' : '9/16',
          maxHeight: '200px',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-accent-hover/20 flex items-center justify-center">
          <div className="text-center">
            <VideoIcon className="w-10 h-10 text-accent/60 mx-auto mb-2" />
            <span className="text-xs text-text-muted">{aspectRatio}</span>
          </div>
        </div>
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
          {formattedDuration}
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="px-4 py-2 bg-accent text-white rounded-lg font-medium">Open</span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-text-primary truncate">{project.title}</h3>
            <p className="text-sm text-text-muted mt-1">
              {project.settings.width}×{project.settings.height} · {project.settings.frameRate}fps
            </p>
            <p className="text-xs text-text-muted mt-1">
              Updated {new Date(project.updatedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <MoreIcon className="w-5 h-5" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-background border border-border rounded-lg shadow-lg z-20 py-1">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onOpen();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2"
                  >
                    <OpenIcon className="w-4 h-4" />
                    Open
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDuplicate();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2"
                  >
                    <DuplicateIcon className="w-4 h-4" />
                    Duplicate
                  </button>
                  <hr className="my-1 border-border" />
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDelete();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    <TrashIcon className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// New Project Modal
function NewProjectModal({
  onClose,
  onCreate,
  isLoading,
}: {
  onClose: () => void;
  onCreate: (data: { title: string; settings: { width: number; height: number; frameRate: number; duration: number; aspectRatio: string } }) => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState('Untitled Project');
  const [selectedAspect, setSelectedAspect] = useState(ASPECT_RATIOS[0]);
  const [frameRate, setFrameRate] = useState(30);
  const [duration, setDuration] = useState(15); // seconds

  const handleCreate = () => {
    onCreate({
      title,
      settings: {
        width: selectedAspect.width,
        height: selectedAspect.height,
        frameRate,
        duration: duration * frameRate,
        aspectRatio: selectedAspect.id,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold text-text-primary mb-6">Create New Project</h2>

        {/* Project Name */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-text-muted mb-2">Project Name</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter project name"
            className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {/* Aspect Ratio */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-text-muted mb-2">Aspect Ratio</label>
          <div className="grid grid-cols-2 gap-3">
            {ASPECT_RATIOS.map((aspect) => (
              <button
                key={aspect.id}
                onClick={() => setSelectedAspect(aspect)}
                className={`p-4 border rounded-lg text-left transition-colors ${
                  selectedAspect.id === aspect.id
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{aspect.icon}</span>
                  <div>
                    <p className="font-medium text-text-primary">{aspect.label}</p>
                    <p className="text-xs text-text-muted">{aspect.width}×{aspect.height}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Frame Rate & Duration */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Frame Rate</label>
            <select
              value={frameRate}
              onChange={(e) => setFrameRate(Number(e.target.value))}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value={24}>24 fps</option>
              <option value={25}>25 fps</option>
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Duration (seconds)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Number(e.target.value)))}
              min={1}
              max={300}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isLoading || !title.trim()}
            className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
    </svg>
  );
}

function OpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function DuplicateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}
