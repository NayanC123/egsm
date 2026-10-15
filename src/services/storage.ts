/**
 * src/services/storage.ts
 *
 * Supabase Storage upload helpers for post attachments (images, PDFs, documents, audio).
 * Uploads files to the public `post-attachments` bucket and returns public URLs.
 */

import { supabase } from './supabase';

export interface UploadedAttachment {
  url: string;
  path: string;
  name: string;
  size?: number;
  mimeType?: string;
}

/**
 * Uploads a local file (from expo-image-picker or expo-document-picker)
 * to Supabase Storage in the `post-attachments` bucket.
 *
 * @param fileUri  Local file URI (e.g. file:///... or content://...)
 * @param fileName Original or preferred name of the file
 * @param mimeType MIME type of the file (e.g. image/jpeg, application/pdf)
 * @param fileSize Size of the file in bytes (optional)
 * @returns Public URL and attachment metadata
 */
export async function uploadPostAttachment(
  fileUri: string,
  fileName: string,
  mimeType?: string,
  fileSize?: number,
): Promise<UploadedAttachment> {
  // Sanitize filename to avoid S3/Supabase key issues
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueKey = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${sanitizedName}`;
  const filePath = `posts/${uniqueKey}`;

  // Fetch the file from local URI into binary data
  const response = await fetch(fileUri);
  const blob = await response.blob();

  const contentType = mimeType || blob.type || 'application/octet-stream';

  const { data, error } = await supabase.storage
    .from('post-attachments')
    .upload(filePath, blob, {
      contentType,
      upsert: false,
    });

  if (error || !data) {
    throw new Error(error?.message || 'Failed to upload attachment to storage.');
  }

  // Get the public URL for the uploaded object
  const { data: urlData } = supabase.storage
    .from('post-attachments')
    .getPublicUrl(filePath);

  return {
    url: urlData.publicUrl,
    path: filePath,
    name: fileName,
    size: fileSize ?? blob.size,
    mimeType: contentType,
  };
}
