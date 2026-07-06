export interface CreateUploadUrlInput {
  key: string;
  contentType: string;
  contentLength: number;
}

export interface PresignedUpload {
  url: string;
  method: 'PUT';
  bucket: string;
  key: string;
  headers: Record<string, string>;
  expiresIn: number;
}

export interface StoragePort {
  isConfigured(): boolean;
  createUploadUrl(input: CreateUploadUrlInput): Promise<PresignedUpload>;
  createDownloadUrl(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
  objectExists(key: string): Promise<boolean>;
  getObjectSize(key: string): Promise<number | null>;
  publicUrl(key: string): string | null;
  isHealthy(): Promise<boolean>;
}
