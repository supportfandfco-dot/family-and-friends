// ═══════════════════════════════════════════════════════
//  ThemeContext — Dark/Light + Wallpaper + Accent
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════

import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

const WALLPAPERS = {
  default:    { label: 'Mint Bubbles',  class: 'wallpaper-default', bg: '#e8fdf2', preview: 'linear-gradient(135deg,#d1fae5,#a7f3d0)' },
  dark:       { label: 'Midnight',      class: 'wallpaper-dark',    bg: '#0d1117', preview: 'linear-gradient(135deg,#1e293b,#0f172a)' },
  amoled:     { label: 'AMOLED Black',  class: 'wallpaper-amoled',  bg: '#000000', preview: '#000000' },
  whatsapp:   { label: 'Classic Chat',  class: 'wallpaper-whatsapp',bg: '#efeae2', preview: '#efeae2' },
  glass:      { label: 'Glassmorphism', class: 'wallpaper-glass',   bg: 'transparent', preview: 'linear-gradient(135deg,#ffffff33,#ffffff11)' },
  ocean:      { label: 'Deep Ocean',    class: 'wallpaper-ocean',   bg: '#e0f2fe', preview: 'linear-gradient(135deg,#38bdf8,#0284c7)' },
  sunset:     { label: 'Golden Hour',   class: 'wallpaper-sunset',  bg: '#fff7ed', preview: 'linear-gradient(135deg,#fb923c,#ec4899)' },
  gradient:   { label: 'Gradient Pack', class: 'wallpaper-gradient',bg: '#ffed4a', preview: 'linear-gradient(135deg,#ffed4a,#ff7ea5)' },
};

// Resolve whether the DOM should be dark based on theme setting + OS
function resolveIsDark(theme) {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('ff_theme') || 'system');

  // isDark is derived — recomputed whenever theme changes or OS changes
  const [isDark, setIsDark] = useState(() => resolveIsDark(localStorage.getItem('ff_theme') || 'system'));

  const [wallpaper, setWallpaper] = useState(
    () => localStorage.getItem('ff_wallpaper') || 'default'
  );
  const [fontSize, setFontSize] = useState(
    () => localStorage.getItem('ff_fontsize') || 'medium'
  );

  // Apply dark class + persist theme choice
  useEffect(() => {
    const dark = resolveIsDark(theme);
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('ff_theme', theme);
  }, [theme]);

  // When theme is 'system', listen for OS changes in real time
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => {
      setIsDark(e.matches);
      document.documentElement.classList.toggle('dark', e.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('ff_wallpaper', wallpaper);
    Object.values(WALLPAPERS).forEach(w => document.documentElement.classList.remove(w.class));
    const selected = WALLPAPERS[wallpaper];
    if (selected) {
      document.documentElement.classList.add(selected.class);
      document.documentElement.style.setProperty('--chat-wallpaper', selected.bg);
    }
  }, [wallpaper, theme]);

  useEffect(() => {
    const sizes = { small: '13px', medium: '15px', large: '17px' };
    document.documentElement.style.fontSize = sizes[fontSize] || '15px';
    localStorage.setItem('ff_fontsize', fontSize);
  }, [fontSize]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{
      theme, setTheme, toggleTheme, isDark,
      wallpaper, setWallpaper, wallpapers: WALLPAPERS,
      wallpaperBg: isDark ? '#0d1117' : (WALLPAPERS[wallpaper]?.bg || '#f0fdf4'),
      fontSize, setFontSize
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
};
