export type JobStatus = 'queued' | 'uploading' | 'processing' | 'completed' | 'failed';

export interface ProgressEventData {
  percent: number;
  stage: string;
  elapsed?: string;
}

export interface CompleteEventData {
  parts: string[];
  downloadUrls: string[];
  totalSizeMB: string;
  durationSec: string;
}

export interface JobSubscriber {
  (event: 'progress' | 'complete' | 'error', data: ProgressEventData | CompleteEventData | { error: string }): void;
}

export interface Job {
  id: string;
  fileName: string;
  fileSize: number;
  status: JobStatus;
  createdAt: number;
  stage: string;
  percent: number;
  elapsed?: string;
  error?: string;
  parts: string[];
  tempDir: string;
  sourceFile: string;
  subscribers: JobSubscriber[];
}
