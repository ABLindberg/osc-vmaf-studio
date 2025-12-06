import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';

export interface S3Config {
  storageType: 'aws' | 's3-compatible';
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKey: string;
  secretKey: string;
  oscToken: string;
}

interface SettingsProps {
  onSave: () => void;
  isOpen: boolean;
  onClose: () => void;
}

function Settings({ onSave, isOpen, onClose }: SettingsProps) {
  const [formData, setFormData] = useState<S3Config>({
    storageType: 's3-compatible',
    endpoint: '',
    region: '',
    accessKey: '',
    secretKey: '',
    oscToken: '',
  });
  const [loading, setLoading] = useState(false);

  // Fetch config from backend when modal opens
  useEffect(() => {
    if (isOpen) {
      apiRequest('/config')
        .then(res => res.json())
        .then(data => {
          // Add s3:// prefix to bucket for display if it's AWS S3 and doesn't have it
          if (data.storageType === 'aws' && data.bucket && !data.bucket.startsWith('s3://')) {
            data.bucket = `s3://${data.bucket}`;
          }
          setFormData(data);
        })
        .catch(err => {
          console.error('Failed to fetch config:', err);
        });
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Prepare form data, stripping s3:// prefix and trailing slashes from bucket if present
      const submitData = { ...formData };

      // For s3-compatible, clear bucket field (it's only for AWS)
      // For AWS, clear endpoint field (it's only for s3-compatible)
      if (submitData.storageType === 's3-compatible') {
        submitData.bucket = '';
      } else if (submitData.storageType === 'aws') {
        submitData.endpoint = '';
      }

      if (submitData.bucket) {
        let bucket = submitData.bucket;
        // Strip s3:// prefix
        if (bucket.startsWith('s3://')) {
          bucket = bucket.substring(5);
        }
        // Strip trailing slashes
        bucket = bucket.replace(/\/+$/, '');
        submitData.bucket = bucket;
      }

      const response = await apiRequest('/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData),
      });

      if (!response.ok) {
        throw new Error('Failed to save config');
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof S3Config, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Storage Type Selector */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Storage Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleChange('storageType', 'aws')}
                className={`py-2 px-4 rounded text-sm font-medium transition-colors ${
                  formData.storageType === 'aws'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                AWS S3
              </button>
              <button
                type="button"
                onClick={() => handleChange('storageType', 's3-compatible')}
                className={`py-2 px-4 rounded text-sm font-medium transition-colors ${
                  formData.storageType === 's3-compatible'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                S3-Compatible
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {formData.storageType === 'aws' ? 'For AWS S3 buckets' : 'For MinIO, OCI Object Storage, etc.'}
            </p>
          </div>

          {/* Conditional Fields based on Storage Type */}
          {formData.storageType === 'aws' ? (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">S3 Bucket</label>
                <input
                  type="text"
                  value={formData.bucket || ''}
                  onChange={(e) => handleChange('bucket', e.target.value)}
                  placeholder="my-bucket-name"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">S3 bucket name (e.g., s3://my-bucket-name)</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">AWS Region</label>
                <input
                  type="text"
                  value={formData.region || ''}
                  onChange={(e) => handleChange('region', e.target.value)}
                  placeholder="eu-north-01"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">e.g., us-east-1, eu-west-1</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">S3 Endpoint</label>
                <input
                  type="text"
                  value={formData.endpoint || ''}
                  onChange={(e) => handleChange('endpoint', e.target.value)}
                  placeholder="https://your-minio.osaas.io"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Full endpoint URL including https://</p>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Access Key</label>
            <input
              type="text"
              value={formData.accessKey}
              onChange={(e) => handleChange('accessKey', e.target.value)}
              placeholder="Access Key ID"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Secret Key</label>
            <input
              type="password"
              value={formData.secretKey}
              onChange={(e) => handleChange('secretKey', e.target.value)}
              placeholder="Secret Access Key"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div className="pt-2 border-t border-gray-700">
            <label className="block text-sm text-gray-400 mb-1">OSaaS Access Token</label>
            <input
              type="password"
              value={formData.oscToken}
              onChange={(e) => handleChange('oscToken', e.target.value)}
              placeholder="Personal Access Token"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">For VMAF analysis via Eyevinn OSaaS</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Settings;
