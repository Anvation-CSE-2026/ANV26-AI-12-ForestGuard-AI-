/**
 * ForestGuard AI / AgniRakshak - Universal View Mode Switcher
 * Provides 1-click toggling between Default Desktop Mode (full multi-column workstation)
 * and Dedicated Mobile Mode (optimized smartphone layout with thumb-friendly bottom nav).
 * 
 * Preserves Desktop Mode as DEFAULT while remembering user preference across sessions.
 */

(function () {
  const STORAGE_KEY = 'agnirakshak_view_mode';

  // Determine current mode:
  // Desktop Mode is DEFAULT unless user explicitly selected 'mobile'
  // or on very small viewport (<768px) with no explicit preference.
  function getStoredMode() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'mobile' || saved === 'desktop') {
        return saved;
      }
      // Keep Desktop mode as default on laptops/desktops (>= 768px)
      // Auto-adapt to mobile on small phone screens only if no explicit setting
      if (window.innerWidth < 768) {
        return 'mobile';
      }
    } catch (e) {
      console.warn('Storage read warning', e);
    }
    return 'desktop';
  }

  let currentMode = getStoredMode();

  // Apply class immediately to documentElement to avoid any Flash of Unstyled Content (FOUC)
  function applyModeClasses(mode) {
    const root = document.documentElement;
    const body = document.body;
    
    if (mode === 'mobile') {
      root.classList.remove('view-mode-desktop');
      root.classList.add('view-mode-mobile');
      if (body) {
        body.classList.remove('view-mode-desktop');
        body.classList.add('view-mode-mobile');
      }
    } else {
      root.classList.remove('view-mode-mobile');
      root.classList.add('view-mode-desktop');
      if (body) {
        body.classList.remove('view-mode-mobile');
        body.classList.add('view-mode-desktop');
      }
    }
  }

  // Initial immediate application
  applyModeClasses(currentMode);

  // Update visual state of all switcher mini buttons on page
  function updateButtonsUI(mode) {
    document.querySelectorAll('.view-mode-toggle-btn').forEach(btn => {
      const isMobileBtn = btn.id === 'btnSetMobileMode' || btn.dataset.mode === 'mobile';
      const isDesktopBtn = btn.id === 'btnSetDesktopMode' || btn.dataset.mode === 'desktop';

      if (mode === 'mobile') {
        if (isMobileBtn) {
          btn.className = 'view-mode-toggle-btn active-mode h-7 px-2.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/60';
          btn.setAttribute('aria-pressed', 'true');
        } else if (isDesktopBtn) {
          btn.className = 'view-mode-toggle-btn h-7 px-2.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer text-slate-400 hover:text-white hover:bg-slate-800/50';
          btn.setAttribute('aria-pressed', 'false');
        }
      } else {
        // Desktop is Active (Default)
        if (isDesktopBtn) {
          btn.className = 'view-mode-toggle-btn active-mode h-7 px-2.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer bg-sky-600 text-white shadow-sm ring-1 ring-sky-400/60';
          btn.setAttribute('aria-pressed', 'true');
        } else if (isMobileBtn) {
          btn.className = 'view-mode-toggle-btn h-7 px-2.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer text-slate-400 hover:text-white hover:bg-slate-800/50';
          btn.setAttribute('aria-pressed', 'false');
        }
      }
    });

    // Also update any floating quick switcher pills if present
    const floatDesk = document.getElementById('floatBtnDesktop');
    const floatMob = document.getElementById('floatBtnMobile');
    if (floatDesk && floatMob) {
      if (mode === 'mobile') {
        floatMob.classList.add('bg-emerald-600', 'text-white');
        floatDesk.classList.remove('bg-sky-600', 'text-white');
      } else {
        floatDesk.classList.add('bg-sky-600', 'text-white');
        floatMob.classList.remove('bg-emerald-600', 'text-white');
      }
    }
  }

  // Toast notification for user feedback
  function showModeToast(message, isMobile) {
    let toast = document.getElementById('viewModeToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'viewModeToast';
      toast.className = 'fixed top-16 left-1/2 -translate-x-1/2 z-[99999999] px-3.5 py-1.5 rounded-full text-xs font-black shadow-2xl border transition-all duration-300 pointer-events-none opacity-0 translate-y-[-10px] flex items-center gap-2 backdrop-blur-md';
      document.body.appendChild(toast);
    }

    if (isMobile) {
      toast.className = 'fixed top-16 left-1/2 -translate-x-1/2 z-[99999999] px-3.5 py-1.5 rounded-full text-xs font-black shadow-2xl border transition-all duration-300 pointer-events-none opacity-100 translate-y-0 flex items-center gap-2 backdrop-blur-md bg-emerald-950/90 border-emerald-500 text-emerald-200';
    } else {
      toast.className = 'fixed top-16 left-1/2 -translate-x-1/2 z-[99999999] px-3.5 py-1.5 rounded-full text-xs font-black shadow-2xl border transition-all duration-300 pointer-events-none opacity-100 translate-y-0 flex items-center gap-2 backdrop-blur-md bg-sky-950/90 border-sky-500 text-sky-200';
    }

    toast.innerHTML = message;

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', 'translate-y-[-10px]');
    }, 2200);
  }

  // Public switcher function
  window.setViewMode = function (mode, showToast = true) {
    if (mode !== 'mobile' && mode !== 'desktop') return;
    currentMode = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (e) {}

    applyModeClasses(mode);
    updateButtonsUI(mode);

    if (showToast) {
      if (mode === 'mobile') {
        showModeToast('📱 <span>Mobile Mode Active • Thumb Navigation Enabled</span>', true);
      } else {
        showModeToast('💻 <span>Desktop Mode Active • Default Multi-Column View Restored</span>', false);
      }
    }

    // Invalidate Leaflet maps after layout recalculation
    setTimeout(() => {
      if (window.forestMapEngine && typeof window.forestMapEngine.invalidateSize === 'function') {
        window.forestMapEngine.invalidateSize();
      }
      if (window.userMap && typeof window.userMap.invalidateSize === 'function') {
        window.userMap.invalidateSize();
      }
      if (window.fullMap && typeof window.fullMap.invalidateSize === 'function') {
        window.fullMap.invalidateSize();
      }
      // Also dispatch event for any custom listeners
      window.dispatchEvent(new CustomEvent('agnirakshak:viewmodechanged', { detail: { mode } }));
    }, 150);

    setTimeout(() => {
      if (window.forestMapEngine && typeof window.forestMapEngine.invalidateSize === 'function') {
        window.forestMapEngine.invalidateSize();
      }
    }, 400);
  };

  window.getViewMode = function () {
    return currentMode;
  };

  // Wire up DOM event listeners once ready
  function initSwitcherListeners() {
    applyModeClasses(currentMode);
    updateButtonsUI(currentMode);

    document.querySelectorAll('#btnSetDesktopMode, [data-set-mode="desktop"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.setViewMode('desktop');
      });
    });

    document.querySelectorAll('#btnSetMobileMode, [data-set-mode="mobile"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.setViewMode('mobile');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSwitcherListeners);
  } else {
    initSwitcherListeners();
  }
})();
