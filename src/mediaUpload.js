// ═══════════════════════════════════════════════════════════
//  Media Upload — ImgBB (images) + Cloudinary (audio/video)
//
//  Deliberately independent of both firebase.js and supabase.js — this
//  has never had anything to do with either backend. It was moved off
//  Firebase Storage specifically to avoid the paid Blaze plan
//  requirement, and stays exactly as-is through the Supabase migration.
//
//  Setup (both free, no credit card):
//    1. ImgBB:      https://api.imgbb.com/  → get an API key
//    2. Cloudinary:  https://cloudinary.com/users/register/free → note your
//       "Cloud name", then Settings → Upload → Add upload preset → set
//       Signing Mode to "Unsigned" → note the preset name
//  Put both in your .env (and Cloudflare Pages env vars for production):
//    VITE_IMGBB_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//    VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
//    VITE_CLOUDINARY_UPLOAD_PRESET=your-unsigned-preset-name
// ═══════════════════════════════════════════════════════════
const IMGBB_API_KEY            = import.meta.env.VITE_IMGBB_API_KEY;
const CLOUDINARY_CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]); // strip data: prefix
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function uploadToImgBB(blob) {
  if (!IMGBB_API_KEY) throw new Error('Missing VITE_IMGBB_API_KEY in .env');
  const base64 = await blobToBase64(blob);
  const form = new FormData();
  form.append('image', base64);

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!json?.success) throw new Error(json?.error?.message || 'ImgBB upload failed');
  return json.data.url;
}

async function uploadToCloudinary(blob, resourceType = 'video') {
  // Cloudinary calls both audio and video "video" resource type for upload
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error('Missing VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET in .env');
  }
  const form = new FormData();
  form.append('file', blob);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!json?.secure_url) throw new Error(json?.error?.message || 'Cloudinary upload failed');
  return json.secure_url;
}

// path is kept as a param for call-site compatibility (used to be the
// Firebase Storage path) — its extension/prefix decides which service and
// resource type to use, but it's no longer an actual storage path.
export async function uploadMedia(fileOrBase64, path) {
  let blob;

  if (typeof fileOrBase64 === 'string' && fileOrBase64.startsWith('data:')) {
    const res = await fetch(fileOrBase64);
    blob = await res.blob();
  } else {
    blob = fileOrBase64;
  }

  if (!blob || blob.size === 0) {
    throw new Error('Empty file — nothing to upload');
  }

  const mime = blob.type || '';
  const isImage = mime.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(path || '');
  const isAudio = mime.startsWith('audio/') || /\.(webm|mp3|m4a|wav|ogg)$/i.test(path || '');

  const uploadPromise = isImage
    ? uploadToImgBB(blob)
    : uploadToCloudinary(blob, isAudio ? 'video' : 'video'); // Cloudinary uses "video" resource type for audio too

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Upload timed out after 30s')), 30_000)
  );

  return Promise.race([uploadPromise, timeoutPromise]);
}
