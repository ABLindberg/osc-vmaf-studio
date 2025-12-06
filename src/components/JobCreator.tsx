import { useState } from 'react';
import { apiRequest } from '../utils/api';

interface UploadedFile {
  type: 'file';
  key: string;
  name: string;
  size: number;
  lastModified?: Date;
}

interface JobCreatorProps {
  files: UploadedFile[];
  onJobCreated: (job: { jobId: string; resultKey: string; referenceKey: string; distortedKey: string; referenceName: string; distortedName: string; description?: string; bucket: string }) => void;
  currentFolder: string;
  selectedReference: string | null;
  selectedDistorted: string | null;
  bucket: string;
}

function JobCreator({ files, onJobCreated, currentFolder, selectedReference, selectedDistorted, bucket }: JobCreatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refFile = files.find(f => f.key === selectedReference);
  const distFile = files.find(f => f.key === selectedDistorted);

  const handleSubmit = async () => {
    if (!selectedReference || !selectedDistorted) {
      alert('Please select both reference (Ref) and distorted (Enc) files from the file browser');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiRequest('/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          referenceKey: selectedReference,
          distortedKey: selectedDistorted,
          folder: currentFolder,
          bucket: bucket,
          description: description.trim() || undefined,
        }),
      });

      const job = await response.json();

      if (!response.ok) {
        // Backend returned an error
        alert(job.error || 'Failed to create VMAF job');
        return;
      }

      onJobCreated({
        jobId: job.jobId,
        resultKey: job.resultKey,
        referenceKey: selectedReference,
        distortedKey: selectedDistorted,
        referenceName: refFile?.name || selectedReference,
        distortedName: distFile?.name || selectedDistorted,
        description: description.trim() || undefined,
        bucket: bucket,
      });

      // Reset form
      setDescription('');
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to create job:', error);
      alert(`Failed to create job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setDescription('');
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setIsOpen(true)}
          className="w-full p-6 text-left hover:bg-gray-750 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-lg font-semibold text-white">Create VMAF Job</span>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Create VMAF Job</h3>
          <button
            onClick={handleCancel}
            disabled={isSubmitting}
            className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Cancel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Instructions */}
          <div className="bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg p-3 text-sm text-blue-200">
            <p className="font-medium mb-1">Select files from the browser above ( ** note that both files must be in the same folder ** ):</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Click a file and select <strong>Ref</strong> for reference video</li>
              <li>Click another file and select <strong>Enc</strong> for encoded/distorted video</li>
            </ul>
          </div>

          {/* Selected Files Display */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Reference File (Ref)
              </label>
              <div className={`bg-gray-700 rounded-lg px-4 py-3 min-h-[44px] flex items-center ${
                !refFile ? 'border-2 border-dashed border-gray-600' : 'border-2 border-green-500'
              }`}>
                {refFile ? (
                  <span className="text-white text-sm truncate">{refFile.name}</span>
                ) : (
                  <span className="text-gray-500 text-sm italic">Not selected</span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Distorted File (Enc)
              </label>
              <div className={`bg-gray-700 rounded-lg px-4 py-3 min-h-[44px] flex items-center ${
                !distFile ? 'border-2 border-dashed border-gray-600' : 'border-2 border-orange-500'
              }`}>
                {distFile ? (
                  <span className="text-white text-sm truncate">{distFile.name}</span>
                ) : (
                  <span className="text-gray-500 text-sm italic">Not selected</span>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description for this analysis job..."
              rows={3}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedReference || !selectedDistorted}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {isSubmitting ? 'Creating...' : 'Start Analysis'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default JobCreator;
