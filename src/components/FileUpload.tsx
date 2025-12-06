import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { apiRequest } from '../utils/api';

interface FileUploadProps {
  onFileUploaded: (file: { key: string; name: string; size: number }) => void;
  folder?: string;
  bucket: string;
  storageType?: 'aws' | 's3-compatible';
}

interface UploadStatus {
  filename: string;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

function FileUpload({ onFileUploaded, folder, bucket, storageType = 's3-compatible' }: FileUploadProps) {
  const [uploads, setUploads] = useState<UploadStatus[]>([]);
  const isAwsS3 = storageType === 'aws';

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      // Add to upload list
      setUploads(prev => [...prev, {
        filename: file.name,
        progress: 0,
        status: 'uploading',
      }]);

      try {
        // Get presigned URL
        const response = await apiRequest('/upload-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            folder: folder,
            bucket: bucket,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to get upload URL');
        }

        const { url, key } = await response.json();

        // Update progress to show we have the URL
        setUploads(prev => prev.map(u =>
          u.filename === file.name && u.status === 'uploading'
            ? { ...u, progress: 10 }
            : u
        ));

        // Upload file to S3 with XMLHttpRequest for progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              const progress = 10 + Math.round((event.loaded / event.total) * 90);
              setUploads(prev => prev.map(u =>
                u.filename === file.name && u.status === 'uploading'
                  ? { ...u, progress }
                  : u
              ));
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Upload failed'));
          });

          xhr.open('PUT', url);
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.send(file);
        });

        // Mark as success
        setUploads(prev => prev.map(u =>
          u.filename === file.name && u.status === 'uploading'
            ? { ...u, progress: 100, status: 'success' }
            : u
        ));

        onFileUploaded({
          key,
          name: file.name,
          size: file.size,
        });

        // Remove from list after a delay
        setTimeout(() => {
          setUploads(prev => prev.filter(u =>
            !(u.filename === file.name && u.status === 'success')
          ));
        }, 3000);

      } catch (error) {
        console.error('Upload failed:', error);
        setUploads(prev => prev.map(u =>
          u.filename === file.name && u.status === 'uploading'
            ? { ...u, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
            : u
        ));

        // Remove error after a delay
        setTimeout(() => {
          setUploads(prev => prev.filter(u =>
            !(u.filename === file.name && u.status === 'error')
          ));
        }, 5000);
      }
    }
  }, [onFileUploaded, folder, bucket]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts'],
    },
    disabled: isAwsS3,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isAwsS3
            ? 'border-gray-700 bg-gray-800/50 cursor-not-allowed'
            : isDragActive
            ? 'border-blue-500 bg-blue-500/10 cursor-pointer'
            : 'border-gray-600 hover:border-gray-500 cursor-pointer'
        }`}
      >
        <input {...getInputProps()} />
        <div className="space-y-2">
          <svg
            className={`mx-auto h-12 w-12 ${isAwsS3 ? 'text-gray-600' : 'text-gray-400'}`}
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {isAwsS3 ? (
            <>
              <p className="text-gray-400">
                File upload not supported for AWS S3
              </p>
              <p className="text-sm text-gray-500">
                Please upload files directly to your S3 bucket using AWS CLI or AWS Console
              </p>
            </>
          ) : isDragActive ? (
            <p className="text-blue-400">Drop the files here...</p>
          ) : (
            <>
              <p className="text-gray-300">
                Drag & drop video files here, or click to select
              </p>
              <p className="text-sm text-gray-500">
                Supports MP4, MKV, AVI, MOV, WebM, TS
              </p>
            </>
          )}
        </div>
      </div>

      {/* Upload progress list */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((upload, index) => (
            <div
              key={`${upload.filename}-${index}`}
              className={`p-3 rounded-lg ${
                upload.status === 'success'
                  ? 'bg-green-900/30 border border-green-700'
                  : upload.status === 'error'
                  ? 'bg-red-900/30 border border-red-700'
                  : 'bg-gray-700/50 border border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm truncate flex-1">{upload.filename}</span>
                {upload.status === 'success' && (
                  <svg className="w-4 h-4 text-green-400 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {upload.status === 'error' && (
                  <svg className="w-4 h-4 text-red-400 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              {upload.status === 'uploading' && (
                <div className="w-full bg-gray-600 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${upload.progress}%` }}
                  />
                </div>
              )}
              {upload.status === 'success' && (
                <p className="text-xs text-green-400">Upload complete</p>
              )}
              {upload.status === 'error' && (
                <p className="text-xs text-red-400">{upload.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FileUpload;
