/**
 * Built-in sample photos for the photo-identification demo (no camera needed).
 * Files live in /samples; import.meta.glob lets Vite copy them into dist and
 * serve them from the dev server alike.
 */
export interface SamplePhoto {
  id: string;
  label: string;
  url: string;
}

const sampleUrls = import.meta.glob('/samples/*.{jpg,jpeg,png}', { eager: true, as: 'url' }) as Record<
  string,
  string
>;

export const SAMPLE_PHOTOS: SamplePhoto[] = Object.entries(sampleUrls).map(([path, url]) => ({
  id: path.split('/').pop() ?? path,
  label: path.split('/').pop() ?? path,
  url,
}));
