'use strict';

/**
 * themes.js
 * ------------------------------------------------------------------
 * Rather than hand-writing a full light AND dark CSS palette for
 * eleven different themes (22 variants to maintain forever), every
 * theme here is defined by just two colors — primary and accent —
 * and a small HSL-based generator derives the entire token set
 * (surfaces, borders, text colors, gradients) from those two colors,
 * for both light and dark mode. The same generator powers the
 * "Custom Theme" color pickers in the Theme Gallery, so a
 * user-picked color pair gets exactly the same quality of derived
 * palette as a built-in theme.
 * ------------------------------------------------------------------
 */

PT.themes = (() => {
  // ---- Small color-math helpers (no dependency needed for this) ------
  function hexToHsl(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, s * 100, l * 100];
  }

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let [r, g, b] = [0, 0, 0];
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  /** Returns a new hex color with lightness set to an absolute percentage. */
  function withLightness(hex, lightness, satMul = 1) {
    const [h, s] = hexToHsl(hex);
    return hslToHex(h, Math.min(100, s * satMul), lightness);
  }

  function withAlpha(hex, alpha) {
    const [h, s, l] = hexToHsl(hex);
    const rgb = hslToHex(h, s, l);
    const r = parseInt(rgb.slice(1, 3), 16);
    const g = parseInt(rgb.slice(3, 5), 16);
    const b = parseInt(rgb.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Derives a complete token map from a primary/accent color pair.
   * This is the single source of truth both for built-in themes and
   * for user-created custom themes.
   */
  function deriveTokens(primary, accent, dark) {
    const [pH] = hexToHsl(primary);
    const tokens = {};

    tokens['--brand-primary'] = primary;
    tokens['--brand-primary-strong'] = withLightness(primary, dark ? 68 : 38);
    tokens['--brand-primary-soft'] = dark ? withAlpha(primary, 0.18) : withLightness(primary, 94, 0.6);
    tokens['--brand-accent'] = accent;
    tokens['--brand-accent-strong'] = withLightness(accent, dark ? 62 : 40);
    tokens['--brand-accent-soft'] = dark ? withAlpha(accent, 0.18) : withLightness(accent, 94, 0.6);

    tokens['--gradient-brand'] = `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`;
    tokens['--gradient-brand-diagonal'] = `linear-gradient(160deg, ${withLightness(primary, dark ? 30 : 45)} 0%, ${primary} 45%, ${accent} 100%)`;
    tokens['--gradient-brand-soft'] = `linear-gradient(135deg, ${withLightness(primary, 94)} 0%, ${withLightness(accent, 94)} 100%)`;
    tokens['--gradient-titlebar'] = `linear-gradient(90deg, ${withLightness(primary, dark ? 16 : 28)} 0%, ${withLightness(primary, dark ? 22 : 38)} 55%, ${withLightness(accent, dark ? 22 : 38)} 100%)`;
    tokens['--gradient-rail'] = `linear-gradient(180deg, ${withLightness(primary, dark ? 10 : 16)} 0%, ${withLightness(accent, dark ? 14 : 20)} 100%)`;

    if (dark) {
      tokens['--surface-0'] = hslToHex(pH, 28, 11);
      tokens['--surface-1'] = hslToHex(pH, 30, 14);
      tokens['--surface-2'] = hslToHex(pH, 30, 18);
      tokens['--surface-3'] = hslToHex(pH, 28, 22);
      tokens['--text-primary'] = hslToHex(pH, 40, 95);
      tokens['--text-secondary'] = hslToHex(pH, 24, 76);
      tokens['--text-muted'] = hslToHex(pH, 18, 58);
      tokens['--border-subtle'] = hslToHex(pH, 26, 24);
      tokens['--border-default'] = hslToHex(pH, 26, 30);
      tokens['--border-strong'] = hslToHex(pH, 30, 42);
      tokens['--page-bg'] = tokens['--surface-1'];
      tokens['--page-margin-guide'] = withAlpha(primary, 0.25);
    } else {
      tokens['--surface-0'] = '#ffffff';
      tokens['--surface-1'] = hslToHex(pH, 60, 98.3);
      tokens['--surface-2'] = hslToHex(pH, 55, 95.5);
      tokens['--surface-3'] = hslToHex(pH, 50, 91.5);
      tokens['--text-primary'] = hslToHex(pH, 32, 15);
      tokens['--text-secondary'] = hslToHex(pH, 18, 40);
      tokens['--text-muted'] = hslToHex(pH, 12, 58);
      tokens['--border-subtle'] = hslToHex(pH, 55, 91);
      tokens['--border-default'] = hslToHex(pH, 50, 85);
      tokens['--border-strong'] = withLightness(primary, 75);
      tokens['--page-bg'] = '#ffffff';
      tokens['--page-margin-guide'] = withAlpha(primary, 0.16);
    }

    return tokens;
  }

  // ---- Theme gallery -------------------------------------------------
  const GALLERY = [
    { id: 'poagit-classic', name: 'Ember Violet', tagline: 'The poagitText Pro default', primary: '#7c3aed', accent: '#e11d48', featured: true },
    { id: 'landrace', name: 'Landrace', tagline: 'A nod to where this app came from', primary: '#d4637a', accent: '#e8836a' },
    { id: 'ocean', name: 'Ocean Blue', primary: '#0ea5e9', accent: '#3b82f6' },
    { id: 'forest', name: 'Forest Green', primary: '#10b981', accent: '#059669' },
    { id: 'sunset', name: 'Sunset Orange', primary: '#f97316', accent: '#ea580c' },
    { id: 'midnight', name: 'Midnight Dark', primary: '#2563eb', accent: '#1e3a8a', forceDark: true },
    { id: 'cottoncandy', name: 'Cotton Candy', primary: '#c4b5fd', accent: '#f0abfc' },
    { id: 'matrix', name: 'Matrix Green', primary: '#10b981', accent: '#065f46', forceDark: true },
    { id: 'royal', name: 'Royal Purple', primary: '#7c3aed', accent: '#5b21b6' },
    { id: 'cherry', name: 'Cherry Blossom', primary: '#ec4899', accent: '#be185d' },
    { id: 'gold', name: 'Gold Rush', primary: '#f59e0b', accent: '#d97706' },
  ];

  function findTheme(id) {
    return GALLERY.find((t) => t.id === id) || GALLERY[0];
  }

  function applyTheme(themeId, { mode } = {}) {
    let theme;
    let primary;
    let accent;

    if (themeId === 'custom' && PT.state.settings.customTheme) {
      theme = { id: 'custom', name: 'Custom' };
      primary = PT.state.settings.customTheme.primary;
      accent = PT.state.settings.customTheme.accent;
    } else {
      theme = findTheme(themeId);
      primary = theme.primary;
      accent = theme.accent;
    }

    const effectiveMode = theme.forceDark ? 'dark' : (mode || PT.state.settings.mode || 'light');
    const dark = effectiveMode === 'dark';

    document.body.dataset.theme = theme.id;
    document.body.dataset.mode = effectiveMode;

    // poagit-classic in light mode is fully defined by the static
    // :root block in variables.css (hand-tuned for the brand), so we
    // only need the generator for every other case.
    if (theme.id === 'poagit-classic' && !dark) {
      document.documentElement.removeAttribute('style');
    } else {
      const tokens = deriveTokens(primary, accent, dark);
      const root = document.documentElement;
      Object.entries(tokens).forEach(([key, value]) => root.style.setProperty(key, value));
    }

    PT.state.emit('theme-applied', { themeId: theme.id, mode: effectiveMode });
  }

  function applyCustom(primary, accent) {
    PT.state.setSetting('customTheme', { primary, accent });
    applyTheme('custom');
  }

  return { GALLERY, findTheme, applyTheme, applyCustom, deriveTokens, hexToHsl, hslToHex, withLightness };
})();

/**
 * ------------------------------------------------------------------
 * Font gallery
 * ------------------------------------------------------------------
 * BUNDLED fonts ship inside the app (see css/fonts.css) and always
 * work offline. EXTENDED fonts are the long tail — real Google Fonts
 * that load on demand via a stylesheet <link> the first time they're
 * picked. That mirrors the "huge font list" from the original app
 * without shipping hundreds of font files no one will ever use.
 * ------------------------------------------------------------------
 */
PT.fonts = (() => {
  const BUNDLED = [
    { family: 'Inter', category: 'Sans Serif', offline: true },
    { family: 'Nunito', category: 'Sans Serif', offline: true },
    { family: 'Poppins', category: 'Sans Serif', offline: true },
    { family: 'Space Grotesk', category: 'Sans Serif', offline: true },
    { family: 'Merriweather', category: 'Serif', offline: true },
    { family: 'Lora', category: 'Serif', offline: true },
    { family: 'Source Serif 4', category: 'Serif', offline: true },
    { family: 'Playfair Display', category: 'Display Serif', offline: true },
    { family: 'EB Garamond', category: 'Classic Serif', offline: true },
    { family: 'Caveat', category: 'Handwriting', offline: true },
    { family: 'JetBrains Mono', category: 'Monospace', offline: true },
    { family: 'Fira Code', category: 'Monospace', offline: true },
  ];

  // A long tail of well-known Google Fonts, loaded on demand. Not
  // bundled — requires an internet connection the first time each one
  // is used in a given session.
  const EXTENDED_NAMES = [
    'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Raleway', 'PT Sans', 'Ubuntu',
    'Rubik', 'Work Sans', 'Karla', 'Manrope', 'DM Sans', 'Outfit', 'Sora', 'Plus Jakarta Sans',
    'Libre Baskerville', 'Crimson Text', 'Cormorant Garamond', 'Bitter', 'Vollkorn', 'Domine',
    'Spectral', 'Zilla Slab', 'Alegreya', 'Noto Serif', 'PT Serif',
    'Dancing Script', 'Pacifico', 'Shadows Into Light', 'Indie Flower', 'Kalam', 'Satisfy',
    'Permanent Marker', 'Amatic SC',
    'Bebas Neue', 'Anton', 'Archivo Black', 'Righteous', 'Fjalla One', 'Abril Fatface',
    'Source Code Pro', 'IBM Plex Mono', 'Space Mono', 'Inconsolata', 'Roboto Mono',
    'IBM Plex Sans', 'IBM Plex Serif', 'Barlow', 'Mulish', 'Josefin Sans', 'Quicksand',
  ];
  const EXTENDED = EXTENDED_NAMES.map((family) => ({ family, category: 'Google Fonts', offline: false }));

  const ALL = [...BUNDLED, ...EXTENDED];
  const loadedRemote = new Set();

  function ensureLoaded(family) {
    const entry = ALL.find((f) => f.family === family);
    if (!entry || entry.offline || loadedRemote.has(family)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;600;700&display=swap`;
      link.onload = () => {
        loadedRemote.add(family);
        resolve(true);
      };
      link.onerror = () => resolve(false);
      document.head.appendChild(link);
      // Fail safe: don't hang forever waiting on a stylesheet that never fires onload.
      setTimeout(() => resolve(loadedRemote.has(family)), 3500);
    });
  }

  function registerCustomFont(fontName, dataUrl) {
    const style = document.createElement('style');
    style.textContent = `@font-face { font-family: '${fontName.replace(/'/g, '')}'; src: url('${dataUrl}'); font-display: swap; }`;
    document.head.appendChild(style);
    ALL.unshift({ family: fontName, category: 'Custom Upload', offline: true });
    return fontName;
  }

  return { BUNDLED, EXTENDED, ALL, ensureLoaded, registerCustomFont };
})();
