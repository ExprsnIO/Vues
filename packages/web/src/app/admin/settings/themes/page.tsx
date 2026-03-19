'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

// Theme Config Interface
interface ThemeConfig {
  colors: {
    background: string;
    surface: string;
    surfaceHover: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    textInverse: string;
    accent: string;
    accentHover: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    border: string;
  };
  typography: {
    fontFamily: string;
    headingFontFamily: string;
    monoFontFamily: string;
    baseFontSize: string;
  };
  spacing: {
    borderRadius: string;
    containerPadding: string;
  };
}

interface Theme {
  id: string;
  name: string;
  description?: string;
  domainId?: string;
  isDefault: boolean;
  isDark: boolean;
  config: ThemeConfig;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// Common web-safe fonts
const FONT_OPTIONS = [
  { value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', label: 'System UI' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
  { value: 'Tahoma, sans-serif', label: 'Tahoma' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet MS' },
  { value: 'Impact, Charcoal, sans-serif', label: 'Impact' },
];

const MONO_FONT_OPTIONS = [
  { value: '"SF Mono", Monaco, "Cascadia Code", monospace', label: 'SF Mono' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
  { value: '"Fira Code", monospace', label: 'Fira Code' },
  { value: 'Consolas, monaco, monospace', label: 'Consolas' },
  { value: 'Menlo, Monaco, monospace', label: 'Menlo' },
];

export default function ThemeSettingsPage() {
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [editingConfig, setEditingConfig] = useState<ThemeConfig | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  // Fetch themes
  const { data: themesData, isLoading } = useQuery({
    queryKey: ['admin', 'themes'],
    queryFn: async () => {
      const res = await api.get<{ themes: Theme[]; total: number }>('/xrpc/io.exprsn.admin.themes.list');
      return res;
    },
  });

  // Fetch default theme templates
  const { data: defaultThemes } = useQuery({
    queryKey: ['admin', 'themes', 'defaults'],
    queryFn: async () => {
      const res = await api.get<{ light: ThemeConfig; dark: ThemeConfig }>('/xrpc/io.exprsn.admin.themes.getDefaults');
      return res;
    },
  });

  // Create theme mutation
  const createThemeMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      isDark: boolean;
      config: ThemeConfig;
      setAsDefault?: boolean;
    }) => {
      const res = await api.post<Theme>('/xrpc/io.exprsn.admin.themes.create', data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'themes'] });
      toast.success('Theme created successfully');
      setShowCreateModal(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create theme');
    },
  });

  // Update theme mutation
  const updateThemeMutation = useMutation({
    mutationFn: async (data: {
      id: string;
      name?: string;
      description?: string;
      isDark?: boolean;
      config?: ThemeConfig;
    }) => {
      const res = await api.post<Theme>('/xrpc/io.exprsn.admin.themes.update', data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'themes'] });
      toast.success('Theme updated successfully');
      setEditingConfig(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update theme');
    },
  });

  // Delete theme mutation
  const deleteThemeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post('/xrpc/io.exprsn.admin.themes.delete', { id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'themes'] });
      toast.success('Theme deleted successfully');
      setSelectedTheme(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete theme');
    },
  });

  // Set default theme mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post('/xrpc/io.exprsn.admin.themes.setDefault', { id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'themes'] });
      toast.success('Default theme updated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to set default theme');
    },
  });

  // Duplicate theme mutation
  const duplicateThemeMutation = useMutation({
    mutationFn: async (data: { id: string; name?: string }) => {
      const res = await api.post<Theme>('/xrpc/io.exprsn.admin.themes.duplicate', data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'themes'] });
      toast.success('Theme duplicated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to duplicate theme');
    },
  });

  const handleSelectTheme = (theme: Theme) => {
    setSelectedTheme(theme);
    setEditingConfig(theme.config);
  };

  const handleSaveChanges = () => {
    if (!selectedTheme || !editingConfig) return;

    updateThemeMutation.mutate({
      id: selectedTheme.id,
      config: editingConfig,
    });
  };

  const handleExportTheme = (theme: Theme) => {
    const dataStr = JSON.stringify(theme, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `theme-${theme.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTheme = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (imported.config && imported.name) {
          createThemeMutation.mutate({
            name: `${imported.name} (Imported)`,
            description: imported.description,
            isDark: imported.isDark ?? true,
            config: imported.config,
          });
        } else {
          toast.error('Invalid theme file');
        }
      } catch (error) {
        toast.error('Failed to parse theme file');
      }
    };
    reader.readAsText(file);
  };

  const updateColor = (key: keyof ThemeConfig['colors'], value: string) => {
    if (!editingConfig) return;
    setEditingConfig({
      ...editingConfig,
      colors: {
        ...editingConfig.colors,
        [key]: value,
      },
    });
  };

  const updateTypography = (key: keyof ThemeConfig['typography'], value: string) => {
    if (!editingConfig) return;
    setEditingConfig({
      ...editingConfig,
      typography: {
        ...editingConfig.typography,
        [key]: value,
      },
    });
  };

  const updateSpacing = (key: keyof ThemeConfig['spacing'], value: string) => {
    if (!editingConfig) return;
    setEditingConfig({
      ...editingConfig,
      spacing: {
        ...editingConfig.spacing,
        [key]: value,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-1/4"></div>
          <div className="h-64 bg-zinc-800 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Theme Configuration</h1>
            <p className="text-zinc-400 mt-1">Customize your platform's visual appearance</p>
          </div>
          <div className="flex gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportTheme}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Import Theme
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Create New Theme
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Theme List Sidebar */}
          <div className="col-span-3">
            <div className="bg-zinc-900 rounded-lg p-4">
              <h3 className="font-semibold mb-4">Themes ({themesData?.total || 0})</h3>
              <div className="space-y-2">
                {themesData?.themes.map((theme: Theme) => (
                  <div
                    key={theme.id}
                    onClick={() => handleSelectTheme(theme)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedTheme?.id === theme.id
                        ? 'bg-blue-600'
                        : 'bg-zinc-800 hover:bg-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{theme.name}</div>
                        {theme.description && (
                          <div className="text-sm text-zinc-400 truncate">{theme.description}</div>
                        )}
                      </div>
                      {theme.isDefault && (
                        <span className="ml-2 px-2 py-0.5 bg-green-600 text-xs rounded">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div
                        className="w-4 h-4 rounded border border-zinc-600"
                        style={{ backgroundColor: theme.config.colors.background }}
                      />
                      <div
                        className="w-4 h-4 rounded border border-zinc-600"
                        style={{ backgroundColor: theme.config.colors.accent }}
                      />
                      <span className="text-xs text-zinc-500">
                        {theme.isDark ? 'Dark' : 'Light'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Theme Editor */}
          <div className="col-span-9">
            {selectedTheme && editingConfig ? (
              <div className="space-y-6">
                {/* Theme Info & Actions */}
                <div className="bg-zinc-900 rounded-lg p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">{selectedTheme.name}</h2>
                      {selectedTheme.description && (
                        <p className="text-zinc-400 mt-1">{selectedTheme.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowPreview(!showPreview)}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm"
                      >
                        {showPreview ? 'Hide' : 'Show'} Preview
                      </button>
                      <button
                        onClick={() => handleExportTheme(selectedTheme)}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm"
                      >
                        Export
                      </button>
                      <button
                        onClick={() => duplicateThemeMutation.mutate({ id: selectedTheme.id })}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm"
                      >
                        Duplicate
                      </button>
                      {!selectedTheme.isDefault && (
                        <button
                          onClick={() => setDefaultMutation.mutate(selectedTheme.id)}
                          className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-sm"
                        >
                          Set as Default
                        </button>
                      )}
                      {!selectedTheme.isDefault && (
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this theme?')) {
                              deleteThemeMutation.mutate(selectedTheme.id);
                            }
                          }}
                          className="px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded text-sm"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Configuration Panel */}
                  <div className="space-y-6">
                    {/* Colors */}
                    <div className="bg-zinc-900 rounded-lg p-6">
                      <h3 className="font-semibold mb-4">Colors</h3>
                      <div className="space-y-4">
                        {Object.entries(editingConfig.colors).map(([key, value]) => (
                          <div key={key}>
                            <label className="block text-sm font-medium mb-1.5 capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="color"
                                value={value}
                                onChange={(e) =>
                                  updateColor(key as keyof ThemeConfig['colors'], e.target.value)
                                }
                                className="w-12 h-10 rounded cursor-pointer"
                              />
                              <input
                                type="text"
                                value={value}
                                onChange={(e) =>
                                  updateColor(key as keyof ThemeConfig['colors'], e.target.value)
                                }
                                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded focus:outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Typography */}
                    <div className="bg-zinc-900 rounded-lg p-6">
                      <h3 className="font-semibold mb-4">Typography</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Font Family</label>
                          <select
                            value={editingConfig.typography.fontFamily}
                            onChange={(e) => updateTypography('fontFamily', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded focus:outline-none focus:border-blue-500"
                          >
                            {FONT_OPTIONS.map((font) => (
                              <option key={font.value} value={font.value}>
                                {font.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">
                            Heading Font Family
                          </label>
                          <select
                            value={editingConfig.typography.headingFontFamily}
                            onChange={(e) => updateTypography('headingFontFamily', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded focus:outline-none focus:border-blue-500"
                          >
                            {FONT_OPTIONS.map((font) => (
                              <option key={font.value} value={font.value}>
                                {font.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">
                            Monospace Font Family
                          </label>
                          <select
                            value={editingConfig.typography.monoFontFamily}
                            onChange={(e) => updateTypography('monoFontFamily', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded focus:outline-none focus:border-blue-500"
                          >
                            {MONO_FONT_OPTIONS.map((font) => (
                              <option key={font.value} value={font.value}>
                                {font.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">
                            Base Font Size
                          </label>
                          <input
                            type="text"
                            value={editingConfig.typography.baseFontSize}
                            onChange={(e) => updateTypography('baseFontSize', e.target.value)}
                            placeholder="16px"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Spacing */}
                    <div className="bg-zinc-900 rounded-lg p-6">
                      <h3 className="font-semibold mb-4">Spacing</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-1.5">
                            Border Radius: {editingConfig.spacing.borderRadius}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="24"
                            value={parseInt(editingConfig.spacing.borderRadius)}
                            onChange={(e) =>
                              updateSpacing('borderRadius', `${e.target.value}px`)
                            }
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">
                            Container Padding
                          </label>
                          <input
                            type="text"
                            value={editingConfig.spacing.containerPadding}
                            onChange={(e) => updateSpacing('containerPadding', e.target.value)}
                            placeholder="16px"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Save Button */}
                    <button
                      onClick={handleSaveChanges}
                      disabled={updateThemeMutation.isPending}
                      className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 rounded-lg font-medium transition-colors"
                    >
                      {updateThemeMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>

                  {/* Preview Panel */}
                  {showPreview && (
                    <div className="sticky top-8">
                      <ThemePreview config={editingConfig} />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-zinc-900 rounded-lg p-12 text-center">
                <div className="text-zinc-500">
                  <svg
                    className="w-16 h-16 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                    />
                  </svg>
                  <p className="text-lg">Select a theme to start editing</p>
                  <p className="text-sm mt-2">
                    Choose a theme from the list or create a new one
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateThemeModal
          onClose={() => setShowCreateModal(false)}
          onCreate={(data) => createThemeMutation.mutate(data)}
          defaultThemes={defaultThemes}
        />
      )}
    </div>
  );
}

// Theme Preview Component
function ThemePreview({ config }: { config: ThemeConfig }) {
  return (
    <div
      className="rounded-lg overflow-hidden border"
      style={{
        backgroundColor: config.colors.background,
        borderColor: config.colors.border,
        fontFamily: config.typography.fontFamily,
        fontSize: config.typography.baseFontSize,
      }}
    >
      <div
        className="p-4 border-b"
        style={{
          backgroundColor: config.colors.surface,
          borderColor: config.colors.border,
        }}
      >
        <h3
          className="font-bold text-lg mb-1"
          style={{
            color: config.colors.textPrimary,
            fontFamily: config.typography.headingFontFamily,
          }}
        >
          Preview
        </h3>
        <p style={{ color: config.colors.textSecondary, fontSize: '0.875rem' }}>
          Live theme preview
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Text Hierarchy */}
        <div>
          <h1
            className="text-2xl font-bold mb-2"
            style={{
              color: config.colors.textPrimary,
              fontFamily: config.typography.headingFontFamily,
            }}
          >
            Heading 1
          </h1>
          <h2
            className="text-xl font-semibold mb-2"
            style={{
              color: config.colors.textPrimary,
              fontFamily: config.typography.headingFontFamily,
            }}
          >
            Heading 2
          </h2>
          <p style={{ color: config.colors.textSecondary }}>
            This is regular paragraph text. It should be easy to read and pleasant to look at.
          </p>
          <p className="text-sm mt-1" style={{ color: config.colors.textMuted }}>
            This is muted text, typically used for less important information.
          </p>
        </div>

        {/* Buttons */}
        <div className="space-y-2">
          <button
            className="w-full px-4 py-2 font-medium transition-colors"
            style={{
              backgroundColor: config.colors.accent,
              color: config.colors.textInverse,
              borderRadius: config.spacing.borderRadius,
            }}
          >
            Primary Button
          </button>
          <button
            className="w-full px-4 py-2 font-medium border transition-colors"
            style={{
              backgroundColor: config.colors.surface,
              color: config.colors.textPrimary,
              borderColor: config.colors.border,
              borderRadius: config.spacing.borderRadius,
            }}
          >
            Secondary Button
          </button>
        </div>

        {/* Card */}
        <div
          className="p-4 border"
          style={{
            backgroundColor: config.colors.surface,
            borderColor: config.colors.border,
            borderRadius: config.spacing.borderRadius,
          }}
        >
          <h4
            className="font-semibold mb-2"
            style={{
              color: config.colors.textPrimary,
              fontFamily: config.typography.headingFontFamily,
            }}
          >
            Card Component
          </h4>
          <p style={{ color: config.colors.textSecondary, fontSize: '0.875rem' }}>
            This is a card component showing surface colors and borders.
          </p>
        </div>

        {/* Status Badges */}
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Success', color: config.colors.success },
            { label: 'Warning', color: config.colors.warning },
            { label: 'Error', color: config.colors.error },
            { label: 'Info', color: config.colors.info },
          ].map((badge) => (
            <span
              key={badge.label}
              className="px-2 py-1 text-xs font-medium"
              style={{
                backgroundColor: badge.color,
                color: config.colors.textInverse,
                borderRadius: config.spacing.borderRadius,
              }}
            >
              {badge.label}
            </span>
          ))}
        </div>

        {/* Form Input */}
        <div>
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: config.colors.textSecondary }}
          >
            Input Field
          </label>
          <input
            type="text"
            placeholder="Enter text here..."
            className="w-full px-3 py-2 border"
            style={{
              backgroundColor: config.colors.background,
              color: config.colors.textPrimary,
              borderColor: config.colors.border,
              borderRadius: config.spacing.borderRadius,
            }}
          />
        </div>

        {/* Code Block */}
        <div
          className="p-3 border"
          style={{
            backgroundColor: config.colors.surface,
            borderColor: config.colors.border,
            borderRadius: config.spacing.borderRadius,
            fontFamily: config.typography.monoFontFamily,
            fontSize: '0.875rem',
          }}
        >
          <code style={{ color: config.colors.textPrimary }}>const theme = "preview";</code>
        </div>
      </div>
    </div>
  );
}

// Create Theme Modal Component
function CreateThemeModal({
  onClose,
  onCreate,
  defaultThemes,
}: {
  onClose: () => void;
  onCreate: (data: any) => void;
  defaultThemes?: { light: ThemeConfig; dark: ThemeConfig };
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDark, setIsDark] = useState(true);
  const [setAsDefault, setSetAsDefault] = useState(false);

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error('Theme name is required');
      return;
    }

    const config = isDark ? defaultThemes?.dark : defaultThemes?.light;
    if (!config) {
      toast.error('Default theme templates not loaded');
      return;
    }

    onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
      isDark,
      config,
      setAsDefault,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 rounded-lg max-w-md w-full p-6">
        <h3 className="text-xl font-bold mb-4">Create New Theme</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Theme Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Custom Theme"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of this theme"
              rows={3}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={isDark}
                onChange={() => setIsDark(true)}
                className="w-4 h-4"
              />
              <span>Dark Theme</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={!isDark}
                onChange={() => setIsDark(false)}
                className="w-4 h-4"
              />
              <span>Light Theme</span>
            </label>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={setAsDefault}
              onChange={(e) => setSetAsDefault(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Set as default theme</span>
          </label>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
          >
            Create Theme
          </button>
        </div>
      </div>
    </div>
  );
}
