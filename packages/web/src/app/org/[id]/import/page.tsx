'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, OrganizationView, BulkImportJobView } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';

type FileType = 'xlsx' | 'csv' | 'sqlite';

interface PreviewRow {
  email?: string;
  handle?: string;
  displayName?: string;
  role?: string;
  [key: string]: string | undefined;
}

export default function BulkImportPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;

  const [organization, setOrganization] = useState<OrganizationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<FileType | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Preview state
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);

  // Job state
  const [currentJob, setCurrentJob] = useState<BulkImportJobView | null>(null);
  const [recentJobs, setRecentJobs] = useState<BulkImportJobView[]>([]);

  useEffect(() => {
    loadData();
  }, [orgId]);

  useEffect(() => {
    // Poll for job status updates
    let interval: NodeJS.Timeout;
    if (currentJob && ['pending', 'processing'].includes(currentJob.status)) {
      interval = setInterval(async () => {
        try {
          const response = await api.getBulkImportStatus(currentJob.id);
          setCurrentJob(response.job);
          if (!['pending', 'processing'].includes(response.job.status)) {
            loadData();
          }
        } catch (err) {
          console.error('Failed to poll job status:', err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [currentJob?.id, currentJob?.status]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [orgResponse, jobsResponse] = await Promise.all([
        api.getOrganization(orgId),
        api.listBulkImportJobs(orgId, { limit: 10 }),
      ]);
      setOrganization(orgResponse.organization);
      setRecentJobs(jobsResponse.jobs);

      // Check if there's an active job
      const activeJob = jobsResponse.jobs.find(
        (j) => j.status === 'pending' || j.status === 'processing'
      );
      if (activeJob) {
        setCurrentJob(activeJob);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const detectFileType = (fileName: string): FileType | null => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
    if (ext === 'csv') return 'csv';
    if (ext === 'sqlite' || ext === 'db' || ext === 'sqlite3') return 'sqlite';
    return null;
  };

  const parseCSVPreview = (content: string): { headers: string[]; rows: PreviewRow[] } => {
    const lines = content.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1, 6).map((line) => {
      const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const row: PreviewRow = {};
      headers.forEach((header, i) => {
        row[header] = values[i];
      });
      return row;
    });

    return { headers, rows };
  };

  const handleFile = useCallback(async (selectedFile: File) => {
    const type = detectFileType(selectedFile.name);
    if (!type) {
      alert('Please select a valid file type (XLSX, CSV, or SQLite)');
      return;
    }

    setFile(selectedFile);
    setFileType(type);

    // Parse preview for CSV files
    if (type === 'csv') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const { headers, rows } = parseCSVPreview(content);
        setPreviewHeaders(headers);
        setPreviewRows(rows);
      };
      reader.readAsText(selectedFile);
    } else {
      // For XLSX and SQLite, show basic info
      setPreviewHeaders([]);
      setPreviewRows([]);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFile(droppedFile);
      }
    },
    [handleFile]
  );

  const handleUpload = async () => {
    if (!file) return;

    try {
      setUploading(true);
      const response = await api.uploadBulkImport(orgId, file);
      setCurrentJob(response.job);
      setFile(null);
      setPreviewHeaders([]);
      setPreviewRows([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async (format: 'csv' | 'xlsx') => {
    try {
      const blob = await api.downloadImportTemplate(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `import-template.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download template');
    }
  };

  const handleCancelJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to cancel this import?')) return;

    try {
      await api.cancelBulkImport(jobId);
      loadData();
      if (currentJob?.id === jobId) {
        setCurrentJob(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel import');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400 bg-green-900/30';
      case 'processing':
        return 'text-blue-400 bg-blue-900/30';
      case 'pending':
        return 'text-yellow-400 bg-yellow-900/30';
      case 'failed':
        return 'text-red-400 bg-red-900/30';
      case 'cancelled':
        return 'text-gray-400 bg-gray-900/30';
      default:
        return 'text-gray-400 bg-gray-900/30';
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-black">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500" />
        </main>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="flex min-h-screen bg-black">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error || 'Organization not found'}</p>
            <button onClick={() => router.back()} className="text-pink-400 hover:text-pink-300">
              Go back
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/org/${orgId}`}
            className="text-gray-400 hover:text-white text-sm mb-2 inline-block"
          >
            &larr; Back to {organization.name}
          </Link>
          <h1 className="text-3xl font-bold text-white">Bulk Import Users</h1>
          <p className="text-gray-400 mt-2">
            Upload a file to import multiple users at once
          </p>
        </div>

        {/* Active Job Progress */}
        {currentJob && ['pending', 'processing'].includes(currentJob.status) && (
          <div className="bg-gray-900 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-medium">Import in Progress</h3>
                <p className="text-gray-400 text-sm">{currentJob.fileName}</p>
              </div>
              <button
                onClick={() => handleCancelJob(currentJob.id)}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                Cancel
              </button>
            </div>

            <div className="mb-2">
              <div className="flex justify-between text-sm text-gray-400 mb-1">
                <span>Progress</span>
                <span>
                  {currentJob.processedRows} / {currentJob.totalRows} rows
                </span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-pink-500 transition-all duration-300"
                  style={{
                    width: `${
                      currentJob.totalRows > 0
                        ? (currentJob.processedRows / currentJob.totalRows) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="flex gap-4 text-sm">
              <span className="text-green-400">
                {currentJob.successCount} successful
              </span>
              <span className="text-red-400">
                {currentJob.errorCount} failed
              </span>
            </div>
          </div>
        )}

        {/* Templates */}
        <div className="bg-gray-900 rounded-xl p-6 mb-8">
          <h3 className="text-white font-medium mb-4">Download Template</h3>
          <p className="text-gray-400 text-sm mb-4">
            Use these templates to ensure your data is formatted correctly.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => handleDownloadTemplate('csv')}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              CSV Template
            </button>
            <button
              onClick={() => handleDownloadTemplate('xlsx')}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Excel Template
            </button>
          </div>
        </div>

        {/* Upload Area */}
        <div className="bg-gray-900 rounded-xl p-6 mb-8">
          <h3 className="text-white font-medium mb-4">Upload File</h3>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
              dragActive
                ? 'border-pink-500 bg-pink-500/10'
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            {file ? (
              <div>
                <p className="text-white font-medium mb-2">{file.name}</p>
                <p className="text-gray-400 text-sm mb-4">
                  {(file.size / 1024).toFixed(1)} KB &bull; {fileType?.toUpperCase()}
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => {
                      setFile(null);
                      setPreviewHeaders([]);
                      setPreviewRows([]);
                    }}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Remove
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="px-6 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-800 text-white rounded-lg transition-colors"
                  >
                    {uploading ? 'Uploading...' : 'Start Import'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-gray-300 mb-2">
                  Drag and drop your file here, or click to browse
                </p>
                <p className="text-gray-500 text-sm mb-4">
                  Supported formats: XLSX, CSV, SQLite
                </p>
                <label className="px-6 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg cursor-pointer transition-colors inline-block">
                  Browse Files
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.sqlite,.db,.sqlite3"
                    className="hidden"
                    onChange={(e) => {
                      const selectedFile = e.target.files?.[0];
                      if (selectedFile) handleFile(selectedFile);
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          {/* CSV Preview */}
          {previewRows.length > 0 && (
            <div className="mt-6">
              <h4 className="text-white font-medium mb-3">Preview (first 5 rows)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {previewHeaders.map((header) => (
                        <th key={header} className="text-left text-gray-400 p-2">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-800">
                        {previewHeaders.map((header) => (
                          <td key={header} className="text-white p-2">
                            {row[header] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Required Fields Info */}
        <div className="bg-gray-900 rounded-xl p-6 mb-8">
          <h3 className="text-white font-medium mb-4">Required Fields</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-pink-400 font-medium">Required</p>
              <ul className="text-gray-400 mt-2 space-y-1">
                <li><code className="text-white">email</code> - User email address</li>
                <li><code className="text-white">handle</code> - Username (3-20 chars)</li>
                <li><code className="text-white">password</code> - Account password (8+ chars)</li>
              </ul>
            </div>
            <div>
              <p className="text-blue-400 font-medium">Optional</p>
              <ul className="text-gray-400 mt-2 space-y-1">
                <li><code className="text-white">displayName</code> - Display name</li>
                <li><code className="text-white">bio</code> - User bio</li>
                <li><code className="text-white">role</code> - admin or member</li>
                <li><code className="text-white">avatarUrl</code> - URL to avatar image</li>
                <li><code className="text-white">website</code> - Personal website</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Recent Jobs */}
        {recentJobs.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-6">
            <h3 className="text-white font-medium mb-4">Recent Imports</h3>
            <div className="space-y-3">
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-4 bg-gray-800 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="text-white font-medium">{job.fileName}</p>
                    <p className="text-gray-400 text-sm">
                      {new Date(job.createdAt).toLocaleString()} &bull;{' '}
                      {job.successCount} imported, {job.errorCount} failed
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm ${getStatusColor(job.status)}`}
                  >
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
