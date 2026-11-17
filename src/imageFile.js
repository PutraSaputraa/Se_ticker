export const imageContentTypes = ['image/png', 'image/jpeg', 'image/webp'];
export const maxImageBytes = 4_000_000;
export const maxImageSizeLabel = `${maxImageBytes / 1_000_000} MB`;
export const imageIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

export function imageFileError(file) {
  if (!file) return '';
  if (!imageContentTypes.includes(file.type)) return 'Pilih gambar dalam format PNG, JPG, atau WebP.';
  if (file.size === 0 || file.size > maxImageBytes) {
    return `Pilih gambar dengan ukuran di atas 0 hingga ${maxImageSizeLabel}.`;
  }
  return '';
}
