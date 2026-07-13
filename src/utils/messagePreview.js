// Pure string logic — no backend dependency, safe to use regardless of
// Firebase/Supabase. Used for chat list previews and notification bodies.
export function makePreview(content, type) {
  if (!content) return '';
  if (type === 'image') return '📷 Photo';
  if (type === 'video') return '🎥 Video';
  if (type === 'voice') return '🎙 Voice note';
  if (type === 'file')  return '📎 File';
  const words = content.replace(/\s+/g, ' ').trim().split(' ');
  return words.slice(0, 4).join(' ') + (words.length > 4 ? '…' : '');
}
