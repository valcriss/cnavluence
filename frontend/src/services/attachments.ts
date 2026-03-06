import { API_BASE_URL, api } from './api';

type UploadImageResponse = {
  attachment: {
    id: string;
  };
  inlineUrl?: string;
};

export async function uploadEditorImage(file: File, spaceId: string, pageId?: string): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('spaceId', spaceId);
  if (pageId) {
    form.append('pageId', pageId);
  }

  const { data } = await api.post<UploadImageResponse>('/attachments/upload-image', form, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  const fallbackInlinePath = `/api/attachments/${data.attachment.id}/inline`;
  return resolveApiUrl(data.inlineUrl ?? fallbackInlinePath);
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  // Resolve relative API paths against API base URL when possible.
  if (/^https?:\/\//i.test(API_BASE_URL)) {
    const apiUrl = new URL(API_BASE_URL);
    return new URL(pathOrUrl, apiUrl.origin).toString();
  }

  return new URL(pathOrUrl, window.location.origin).toString();
}
