import { useState, useEffect, useCallback, useRef } from 'react';
import FileUpload from './components/FileUpload';
import FileList from './components/FileList';
import JobCreator from './components/JobCreator';
import ResultsViewer from './components/ResultsViewer';
import VmafScoreCircle from './components/VmafScoreCircle';
import Settings from './components/Settings';
import Help from './components/Help';
import { apiRequest } from './utils/api';

interface UploadedFile {
  type: 'file';
  key: string;
  name: string;
  size: number;
  lastModified?: Date;
}

interface Folder {
  type: 'folder';
  key: string;
  name: string;
}

interface JobMetadata {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  referenceKey: string;
  distortedKey: string;
  referenceName: string;
  distortedName: string;
  resultKey: string;
  bucket: string;
  oscJobName?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
  vmafScore?: number;
  description?: string;
}

interface VmafResult {
  jobId: string;
  status: string;
  vmafScore: number;
  frames: Array<{ frameNum: number; [key: string]: number }>; // Dynamic vmaf_* metrics
  vmafMetrics: Record<string, {
    min: number;
    max: number;
    mean: number;
    harmonic_mean: number;
  }>;
  primaryMetric: string;
}

interface AnalysisJob {
  jobId: string;
  referenceKey: string;
  distortedKey: string;
  referenceName: string;
  distortedName: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  bucket: string; // Which bucket this job belongs to
  oscJobName?: string;
  oscJobStatus?: string;
  resultKey?: string;
  result?: VmafResult;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  vmafScore?: number; // Summary score from metadata for display on collapsed card
  description?: string;
}

function App() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const [selectedDistorted, setSelectedDistorted] = useState<string | null>(null);
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const jobsRef = useRef<AnalysisJob[]>([]);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [currentBucket, setCurrentBucket] = useState<string>('');
  const [buckets, setBuckets] = useState<string[]>([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [storageType, setStorageType] = useState<'aws' | 's3-compatible'>('s3-compatible');

  // Keep jobsRef in sync with jobs state
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // Check if backend is configured
  const checkConfiguration = useCallback(async () => {
    try {
      const response = await apiRequest('/config');
      const config = await response.json();

      // Store storage type for UI logic
      setStorageType(config.storageType || 's3-compatible');

      // For AWS S3: need bucket, region, accessKey, secretKey, oscToken
      // For S3-Compatible: need endpoint, accessKey, secretKey, oscToken
      const configured = config.storageType === 'aws'
        ? !!(config.bucket && config.region && config.accessKey && config.secretKey && config.oscToken)
        : !!(config.endpoint && config.accessKey && config.secretKey && config.oscToken);

      setIsConfigured(configured);
    } catch (error) {
      console.error('Failed to check configuration:', error);
      setIsConfigured(false);
    }
  }, []);

  useEffect(() => {
    checkConfiguration();
  }, [checkConfiguration]);

  const loadBuckets = useCallback(async () => {
    try {
      const response = await apiRequest('/buckets');

      if (response.ok) {
        const data = await response.json();
        setBuckets(data.buckets || []);

        // If no bucket is selected and we have buckets, select the first one
        setCurrentBucket(prev => {
          if (!prev && data.buckets.length > 0) {
            return data.buckets[0];
          }
          return prev;
        });
      } else {
        const errorData = await response.json();
        alert(`Failed to load buckets: ${errorData.error || 'Unknown error'}`);
        // Clear everything when bucket loading fails
        setBuckets([]);
        setCurrentBucket('');
        setFiles([]);
        setFolders([]);
        setJobs([]);
      }
    } catch (error) {
      console.error('Failed to load buckets:', error);
      alert('Failed to connect to storage. Please check your configuration.');
      // Clear everything when connection fails
      setBuckets([]);
      setCurrentBucket('');
      setFiles([]);
      setFolders([]);
      setJobs([]);
    }
  }, []);

  const loadFiles = useCallback(async () => {
    if (!currentBucket) {
      return;
    }

    setIsLoadingFiles(true);
    try {
      const url = currentFolder
        ? `/api/files?folder=${encodeURIComponent(currentFolder)}&bucket=${encodeURIComponent(currentBucket)}`
        : `/api/files?bucket=${encodeURIComponent(currentBucket)}`;

      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        setFolders(data.folders || []);
        setFiles(data.files || []);
      } else {
        const errorData = await response.json();
        alert(`Failed to load files: ${errorData.error || 'Unknown error'}`);
        setFolders([]);
        setFiles([]);
      }
    } catch (error) {
      console.error('Failed to load files:', error);
      alert('Failed to load files. Please check your storage configuration and bucket permissions.');
      setFolders([]);
      setFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [currentFolder, currentBucket]);

  const handleSaveConfig = async () => {
    // Check configuration and reload buckets and jobs
    // Reset current selections when switching storage
    setCurrentBucket('');
    setCurrentFolder('');
    setSelectedReference(null);
    setSelectedDistorted(null);
    setJobs([]);
    setBuckets([]);

    await checkConfiguration();
    await loadBuckets();
    await loadJobs();
  };

  const handleBucketChange = (newBucket: string) => {
    setCurrentBucket(newBucket);
    setCurrentFolder(''); // Reset to root when changing buckets
    setSelectedReference(null);
    setSelectedDistorted(null);
  };

  const handleCreateBucket = async () => {
    const bucketName = prompt('Enter new bucket name (lowercase letters, numbers, and hyphens only):');
    if (!bucketName) return;

    try {
      const response = await apiRequest('/buckets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bucketName }),
      });

      if (response.ok) {
        await loadBuckets();
        setCurrentBucket(bucketName);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create bucket');
      }
    } catch (error) {
      console.error('Error creating bucket:', error);
      alert('Failed to create bucket');
    }
  };

  // Poll for job results
  const pollForResults = useCallback(async (jobId: string): Promise<void> => {
    const maxAttempts = 120; // Poll for up to 10 minutes
    const pollInterval = 5000; // 5 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Get the job to access its bucket
      const job = jobsRef.current.find(j => j.jobId === jobId);
      if (!job) {
        return;
      }

      // First check job status
      const statusResponse = await fetch(`/api/jobs/${jobId}/status`);
      const statusResult = await statusResponse.json();

      // Update job status in the list
      setJobs(prev => prev.map(job =>
        job.jobId === jobId
          ? {
              ...job,
              status: statusResult.status,
              oscJobName: statusResult.oscJobName || job.oscJobName,
              oscJobStatus: statusResult.oscJobStatus
            }
          : job
      ));

      // If job is completed, fetch the results
      if (statusResult.status === 'completed') {
        const resultsResponse = await fetch(`/api/results/${jobId}?bucket=${encodeURIComponent(job.bucket)}`);
        const result = await resultsResponse.json();

        if (result.vmafScore !== undefined) {
          setJobs(prev => prev.map(job =>
            job.jobId === jobId
              ? { ...job, status: 'completed', result, vmafScore: result.vmafScore }
              : job
          ));
          return;
        }
      } else if (statusResult.status === 'failed') {
        setJobs(prev => prev.map(job =>
          job.jobId === jobId
            ? { ...job, status: 'failed', error: statusResult.error || 'Analysis failed' }
            : job
        ));
        throw new Error(statusResult.error || 'Analysis failed');
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    setJobs(prev => prev.map(job =>
      job.jobId === jobId
        ? { ...job, status: 'failed', error: 'Analysis timed out' }
        : job
    ));
    throw new Error('Analysis timed out');
  }, []);

  // Load jobs from current bucket
  const loadJobs = useCallback(async () => {
    if (!currentBucket) {
      return;
    }

    try {
      const response = await fetch(`/api/jobs?bucket=${encodeURIComponent(currentBucket)}`);

      if (response.ok) {
        const jobMetadata = await response.json();
        // Convert the metadata to AnalysisJob format
        const loadedJobs: AnalysisJob[] = jobMetadata.map((meta: JobMetadata) => ({
          jobId: meta.jobId,
          referenceKey: meta.referenceKey,
          distortedKey: meta.distortedKey,
          referenceName: meta.referenceName,
          distortedName: meta.distortedName,
          status: meta.status,
          bucket: meta.bucket,
          oscJobName: meta.oscJobName,
          resultKey: meta.resultKey,
          error: meta.error,
          createdAt: new Date(meta.createdAt),
          completedAt: meta.completedAt ? new Date(meta.completedAt) : undefined,
          vmafScore: meta.vmafScore,
          description: meta.description,
        }));
        setJobs(loadedJobs);

        // Start polling for any running or queued jobs
        loadedJobs.forEach(job => {
          if (job.status === 'running' || job.status === 'queued') {
            pollForResults(job.jobId).catch(error => {
              console.error(`Polling failed for job ${job.jobId}:`, error);
            });
          }
        });
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  }, [currentBucket, pollForResults]);

  useEffect(() => {
    loadBuckets();
  }, [loadBuckets]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleFileUploaded = (file: { key: string; name: string; size: number }) => {
    setFiles(prev => [...prev, { ...file, type: 'file' as const }]);
  };

  const handleNavigateToFolder = (folder: string) => {
    setCurrentFolder(folder);
    setSelectedReference(null);
    setSelectedDistorted(null);
  };

  const handleCreateFolder = async () => {
    const folderName = prompt('Enter folder name:');
    if (!folderName) return;

    try {
      const response = await apiRequest('/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderName,
          parentFolder: currentFolder,
          bucket: currentBucket,
        }),
      });

      if (response.ok) {
        loadFiles();
      } else {
        alert('Failed to create folder');
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      alert('Failed to create folder');
    }
  };

  const handleDeleteFile = async (key: string) => {
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadFiles();
        if (selectedReference === key) setSelectedReference(null);
        if (selectedDistorted === key) setSelectedDistorted(null);
      } else {
        alert('Failed to delete file');
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('Failed to delete file');
    }
  };

  const handleDeleteFolder = async (key: string) => {
    try {
      const response = await fetch(`/api/folders/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadFiles();
      } else {
        alert('Failed to delete folder');
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
      alert('Failed to delete folder');
    }
  };

  const handleJobCreated = async (jobData: {
    jobId: string;
    resultKey: string;
    referenceKey: string;
    distortedKey: string;
    referenceName: string;
    distortedName: string;
    description?: string;
    bucket: string;
  }) => {
    // Add job to state immediately
    const newJob: AnalysisJob = {
      jobId: jobData.jobId,
      referenceKey: jobData.referenceKey,
      distortedKey: jobData.distortedKey,
      referenceName: jobData.referenceName,
      distortedName: jobData.distortedName,
      status: 'queued',
      bucket: jobData.bucket,
      resultKey: jobData.resultKey,
      createdAt: new Date(),
      description: jobData.description,
    };

    setJobs(prev => {
      const updatedJobs = [newJob, ...prev];
      // Update ref immediately so polling can access it
      jobsRef.current = updatedJobs;
      return updatedJobs;
    });

    // Poll for results in the background
    pollForResults(jobData.jobId).catch(error => {
      console.error('Analysis failed:', error);
    });
  };

  const toggleJobExpanded = async (jobId: string) => {
    const job = jobs.find(j => j.jobId === jobId);
    if (!job) return;

    const isCurrentlyExpanded = expandedJobs.has(jobId);

    if (isCurrentlyExpanded) {
      // Just collapse
      setExpandedJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
    } else {
      // Expand and fetch results if not already loaded
      setExpandedJobs(prev => {
        const newSet = new Set(prev);
        newSet.add(jobId);
        return newSet;
      });

      // Fetch results if job is completed but results not loaded
      if (job.status === 'completed' && !job.result) {
        try {
          const resultsResponse = await fetch(`/api/results/${jobId}?bucket=${encodeURIComponent(job.bucket)}`);
          const result = await resultsResponse.json();

          if (result.vmafScore !== undefined) {
            setJobs(prev => prev.map(j =>
              j.jobId === jobId ? { ...j, result } : j
            ));
          }
        } catch (error) {
          console.error('Failed to fetch results:', error);
        }
      }
    }
  };

  const handleDownloadResults = async (job: AnalysisJob) => {
    if (!job.result || !job.oscJobName) return;

    try {
      // Fetch the raw result file from the backend
      const response = await fetch(`/api/results/${job.jobId}/raw?bucket=${encodeURIComponent(job.bucket)}`);

      if (!response.ok) {
        throw new Error('Failed to fetch raw results');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Format: vmaf-<referenceName>-<distortedName>-<oscJobName>.json
      link.download = `vmaf-${job.referenceName}-${job.distortedName}-${job.oscJobName}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download results:', error);
      alert('Failed to download results');
    }
  };

  const handleDeleteJob = async (job: AnalysisJob) => {
    const confirmMessage = `Are you sure you want to delete this job?\n\n` +
      `Job: ${job.referenceName} vs ${job.distortedName}\n` +
      `${job.description ? `Description: ${job.description}\n` : ''}` +
      `\nThis will delete:\n` +
      `• Job metadata\n` +
      `• Result files (if any)\n` +
      `\nThe source files (reference and encoded videos) will NOT be deleted.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await fetch(`/api/jobs/${job.jobId}?bucket=${encodeURIComponent(job.bucket)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete job');
      }

      // Remove from local state
      setJobs(prev => prev.filter(j => j.jobId !== job.jobId));

      // Remove from expanded jobs if it was expanded
      setExpandedJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(job.jobId);
        return newSet;
      });
    } catch (error) {
      console.error('Failed to delete job:', error);
      alert('Failed to delete job. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gradient-to-r from-indigo-900 via-purple-900 to-pink-900 border-b-2 border-pink-500/30 shadow-lg">
        <div className="container mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            {/* Logo/Title Section */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full shadow-lg overflow-hidden flex items-center justify-center">
                <img src="/favicon.svg" alt="OSC VMAF Studio" className="w-full h-full" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                  OSC VMAF Studio
                </h1>
                <p className="text-purple-200 text-sm mt-1">
                  Cloud Video Quality Analysis
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowHelp(true)}
                className="group relative p-3 rounded-xl transition-all duration-300 bg-purple-600/50 hover:bg-purple-500 border border-purple-400/30 hover:border-purple-300 shadow-lg hover:shadow-purple-500/50 hover:scale-105"
                title="Help & Documentation"
              >
                <svg className="w-6 h-6 text-purple-100 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  Help
                </span>
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="group relative p-3 rounded-xl transition-all duration-300 bg-pink-600/50 hover:bg-pink-500 border border-pink-400/30 hover:border-pink-300 shadow-lg hover:shadow-pink-500/50 hover:scale-105"
                title="Settings"
              >
                <svg className="w-6 h-6 text-pink-100 group-hover:text-white group-hover:rotate-90 transition-all duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  Settings
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* Configuration Warning Banner */}
        {!isConfigured && (
          <div className="mb-6 bg-yellow-900/30 border-2 border-yellow-600 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-yellow-500 mb-2">Configuration Required</h3>
                <p className="text-yellow-200 mb-3">
                  Please configure your S3 storage and Eyevinn OSC credentials to start using OSC VMAF Studio.
                </p>
                <button
                  onClick={() => setShowSettings(true)}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg transition-colors"
                >
                  Open Settings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload and Manage Files Section - Full Width Collapsible */}
        <div className={`mb-8 relative ${!isConfigured ? 'opacity-50' : ''}`}>
          {!isConfigured && (
            <div className="absolute inset-0 z-10 cursor-not-allowed" title="Please configure settings first"></div>
          )}
          {showUpload ? (
            <section className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">Upload and Manage Files</h2>
                  <button
                    onClick={() => setShowUpload(false)}
                    className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                    title="Collapse"
                  >
                    <svg className="w-5 h-5 transition-transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Upload Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-4">Upload Videos</h3>
                  <FileUpload onFileUploaded={handleFileUploaded} folder={currentFolder} bucket={currentBucket} storageType={storageType} />
                </div>

                {/* File Browser */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Uploaded Files</h3>
                    <button
                      onClick={loadFiles}
                      disabled={isLoadingFiles}
                      className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Refresh files"
                    >
                      <svg
                        className={`w-4 h-4 ${isLoadingFiles ? 'animate-spin' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>

                  {/* Bucket Selector */}
                  <div className="mb-4">
                    <label className="block text-xs text-gray-400 mb-2">Select Bucket</label>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {buckets.map(bucket => (
                        <button
                          key={bucket}
                          onClick={() => handleBucketChange(bucket)}
                          className={`shrink-0 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                            currentBucket === bucket
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                            </svg>
                            <span className="font-medium">{bucket}</span>
                          </div>
                        </button>
                      ))}
                      {storageType !== 'aws' && (
                        <button
                          onClick={handleCreateBucket}
                          className="shrink-0 px-3 py-1.5 text-sm rounded-lg border border-dashed border-gray-500 text-gray-400 hover:bg-gray-700 hover:border-gray-400 hover:text-gray-300 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span className="font-medium">Create Bucket</span>
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                  <FileList
                    files={files}
                    folders={folders}
                    currentFolder={currentFolder}
                    currentBucket={currentBucket}
                    selectedReference={selectedReference}
                    selectedDistorted={selectedDistorted}
                    onSelectReference={setSelectedReference}
                    onSelectDistorted={setSelectedDistorted}
                    onNavigateToFolder={handleNavigateToFolder}
                    onCreateFolder={handleCreateFolder}
                    onDeleteFile={handleDeleteFile}
                    onDeleteFolder={handleDeleteFolder}
                  />
                </div>
              </div>
            </section>
          ) : (
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowUpload(true)}
                className="w-full p-6 text-left hover:bg-gray-750 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    </div>
                    <span className="text-lg font-semibold text-white">Upload and Manage Files</span>
                  </div>
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Jobs Section - Full Width */}
        <div className={`mt-8 relative ${!isConfigured ? 'opacity-50' : ''}`}>
          {!isConfigured && (
            <div className="absolute inset-0 z-10 cursor-not-allowed" title="Please configure settings first"></div>
          )}
          <h2 className="text-xl font-semibold mb-4">VMAF Jobs</h2>
          <div className="space-y-4">
            {/* Job Creator */}
            <JobCreator
              files={files}
              onJobCreated={handleJobCreated}
              currentFolder={currentFolder}
              selectedReference={selectedReference}
              selectedDistorted={selectedDistorted}
              bucket={currentBucket}
            />

            {/* Completed/Running Jobs List */}
            {jobs.map(job => {
              const isExpanded = expandedJobs.has(job.jobId);
              return (
                <div key={job.jobId} className="bg-gray-800 rounded-lg overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-center justify-between gap-6">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`w-3 h-3 rounded-full ${
                              job.status === 'completed' ? 'bg-green-500' :
                              job.status === 'failed' ? 'bg-red-500' :
                              job.status === 'running' ? 'bg-blue-500 animate-pulse' :
                              'bg-yellow-500'
                            }`}></span>
                            <span className="text-sm text-gray-400">
                              {job.status === 'completed' ? 'Completed' :
                               job.status === 'failed' ? 'Failed' :
                               job.oscJobStatus || 'Queued'}
                            </span>
                            <span className="text-xs text-gray-500">
                              Started: {job.createdAt.toLocaleString()}
                            </span>
                            {job.completedAt && (
                              <span className="text-xs text-gray-500">
                                Completed: {job.completedAt.toLocaleString()}
                              </span>
                            )}
                            <span className="text-xs text-gray-600 font-mono">
                              ID: {job.jobId}
                            </span>
                          </div>
                          {job.description && (
                            <div className="mb-3">
                              <p className="text-sm text-gray-300 italic">"{job.description}"</p>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-400">Reference:</span>
                              <p className="font-medium truncate" title={job.referenceKey}>{job.referenceKey}</p>
                            </div>
                            <div>
                              <span className="text-gray-400">Encoded:</span>
                              <p className="font-medium truncate" title={job.distortedKey}>{job.distortedKey}</p>
                            </div>
                          </div>
                          {job.oscJobName && job.resultKey && (
                            <div className="mt-2 text-xs text-gray-500">
                              <span className="text-gray-400">Raw result data:</span>{' '}
                              {job.resultKey.substring(0, job.resultKey.lastIndexOf('/'))}/{job.oscJobName}.json
                            </div>
                          )}
                          {job.error && (
                            <div className="mt-2 text-red-400 text-sm">
                              Error: {job.error}
                            </div>
                          )}
                        </div>
                        {job.vmafScore !== undefined && (
                          <div className="flex items-center">
                            <VmafScoreCircle score={job.vmafScore} />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDeleteJob(job)}
                            className="p-2 rounded-lg bg-gray-700 hover:bg-red-600 transition-colors"
                            title="Delete job"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          {job.status === 'completed' && (
                            <button
                              onClick={() => handleDownloadResults(job)}
                              className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                              title="Download JSON"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </button>
                          )}
                          {job.status === 'completed' && (
                            <button
                              onClick={() => toggleJobExpanded(job.jobId)}
                              className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                              title={isExpanded ? "Collapse" : "Expand"}
                            >
                              <svg
                                className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Results */}
                  {isExpanded && job.result && (
                    <div className="px-6 pb-6 pt-0 border-t border-gray-700">
                      <ResultsViewer results={job.result} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <Settings
        onSave={handleSaveConfig}
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      <Help
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
      />
    </div>
  );
}

export default App;
