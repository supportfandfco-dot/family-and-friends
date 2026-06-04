// ═══════════════════════════════════════════════════════
//  ThemeContext — Dark/Light + Wallpaper + Accent
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════

import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

const WALLPAPERS = {
  default: { label: 'Mint Bubbles',  class: 'wallpaper-default', bg: '#e8fdf2', preview: 'linear-gradient(135deg,#d1fae5,#a7f3d0)' },
  dark:    { label: 'Midnight',      class: 'wallpaper-dark',    bg: '#0d1117', preview: 'linear-gradient(135deg,#1e293b,#0f172a)' },
  ocean:   { label: 'Deep Ocean',    class: 'wallpaper-ocean',   bg: '#e0f2fe', preview: 'linear-gradient(135deg,#38bdf8,#0284c7)' },
  sunset:  { label: 'Golden Hour',   class: 'wallpaper-sunset',  bg: '#fff7ed', preview: 'linear-gradient(135deg,#fb923c,#ec4899)' },
  forest:  { label: 'Enchanted',     class: 'wallpaper-forest',  bg: '#f0fdf4', preview: 'linear-gradient(135deg,#4ade80,#166534)' },
  minimal: { label: 'Rose Lattice',  class: 'wallpaper-minimal', bg: '#fff1f2', preview: 'linear-gradient(135deg,#fda4af,#fb7185)' },
  aurora:  { label: 'Aurora',        class: 'wallpaper-aurora',  bg: '#f0f9ff', preview: 'linear-gradient(135deg,#a78bfa,#38bdf8)' },
  sakura:  { label: 'Sakura',        class: 'wallpaper-sakura',  bg: '#fff0f6', preview: 'linear-gradient(135deg,#f9a8d4,#fce7f3)' },
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('ff_theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [wallpaper, setWallpaper] = useState(
    () => localStorage.getItem('ff_wallpaper') || 'default'
  );
  const [fontSize, setFontSize] = useState(
    () => localStorage.getItem('ff_fontsize') || 'medium'
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('ff_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('ff_wallpaper', wallpaper);
    // Remove all wallpaper classes from <html>
    Object.values(WALLPAPERS).forEach(w => document.documentElement.classList.remove(w.class));
    // Only apply wallpaper class in light mode — dark mode uses its own background
    if (theme !== 'dark') {
      const selected = WALLPAPERS[wallpaper];
      if (selected) {
        document.documentElement.classList.add(selected.class);
        document.documentElement.style.setProperty('--chat-wallpaper', selected.bg);
      }
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
      theme, setTheme, toggleTheme, isDark: theme === 'dark',
      wallpaper, setWallpaper, wallpapers: WALLPAPERS,
      wallpaperBg: theme === 'dark' ? '#0d1117' : (WALLPAPERS[wallpaper]?.bg || '#f0fdf4'),
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
