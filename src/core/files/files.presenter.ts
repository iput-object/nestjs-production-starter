import type { FileObject, FileStatus, FileVisibility } from '@prisma-client';

export interface FileView {
  id: string;
  key: string;
  contentType: string;
  size: number | null;
  originalName: string | null;
  status: FileStatus;
  visibility: FileVisibility;
  createdAt: Date;
}

export function toFileView(file: FileObject): FileView {
  return {
    id: file.id,
    key: file.key,
    contentType: file.contentType,
    size: file.size,
    originalName: file.originalName,
    status: file.status,
    visibility: file.visibility,
    createdAt: file.createdAt,
  };
}
