// dashboardSwitcher.js - ForestGuard AI Universal Dashboard Switcher (Port 8119)
(function() {
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const BASE_URL = isLocal ? `${window.location.protocol}//${window.location.hostname}:${window.location.port || '8119'}` : (typeof window !== 'undefined' ? window.location.origin : '');

  function getPageType() {
    const p = window.location.pathname.toLowerCase();
    if (p.includes('admin')) return 'admin';
    if (p.includes('user')) return 'user';
    if (p.includes('demo')) return 'demo';
    if (p.includes('station')) return 'station';
    if (p.includes('report')) return 'report';
    return 'home';
  }

  function navigateTo(dest) {
    if (dest === 'admin') {
      window.location.href = `${BASE_URL}/admin.html`;
    } else if (dest === 'user') {
      window.location.href = `${BASE_URL}/user.html`;
    } else if (dest === 'demo') {
      window.location.href = `${BASE_URL}/demo.html`;
    } else if (dest === 'home') {
      window.location.href = `${BASE_URL}/index.html`;
    }
  }

  // Intercept and enforce all [data-switch-to] elements to navigate cleanly to Port 8119
  function initHeaderButtons() {
    document.querySelectorAll('[data-switch-to]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = btn.getAttribute('data-switch-to');
        navigateTo(target);
      });
    });
  }

  // Keyboard shortcut: Alt+S or Alt+D to toggle between User & Admin dashboards instantly
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 's' || e.key === 'S' || e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      const current = getPageType();
      if (current === 'user') {
        navigateTo('admin');
      } else if (current === 'admin') {
        navigateTo('user');
      } else {
        navigateTo('user');
      }
    }
  });

  // Inject or upgrade Universal Floating Switcher Dock
  function injectFloatingSwitcher() {
    // If inside an iframe (such as Dual Split Demo), skip injecting floating dock inside frame
    if (window.self !== window.top) return;
    if (document.getElementById('universalDashboardSwitcher')) return;

    const current = getPageType();
    const dock = document.createElement('div');
    dock.id = 'universalDashboardSwitcher';
    dock.className = 'fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 p-1.5 bg-[#050b17]/95 border-2 border-orange-500/80 rounded-2xl shadow-[0_12px_30px_rgba(0,0,0,0.85)] backdrop-blur-md font-sans text-xs select-none transition-all hover:border-orange-400';

    const isUser = current === 'user';
    const isAdmin = current === 'admin';
    const isDemo = current === 'demo';

    dock.innerHTML = `
      <!-- Port Indicator -->
      <div class="hidden sm:flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase text-amber-400 tracking-wider">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>PORT 8119:</span>
      </div>

      <!-- User/Citizen Switch Button -->
      <a href="${BASE_URL}/user.html" id="fgSwitchBtnUser" class="px-2.5 sm:px-3 py-1.5 rounded-xl font-black transition flex items-center gap-1 ${
        isUser 
          ? 'bg-orange-600 text-white shadow-md cursor-default pointer-events-none' 
          : 'bg-[#0d182e] text-orange-300 hover:bg-orange-600 hover:text-white border border-orange-800/80 shadow-sm'
      }" title="Switch to Citizen Emergency Reporting Dashboard (Port 8119)">
        <span>👤</span>
        <span>${isUser ? 'Citizen (Active)' : 'Citizen Dashboard'}</span>
      </a>

      <!-- Quick Switch Arrow Divider -->
      <span class="text-slate-500 text-xs font-bold px-0.5">⇄</span>

      <!-- Admin Command Center Switch Button -->
      <a href="${BASE_URL}/admin.html?auth=demo" id="fgSwitchBtnAdmin" class="px-2.5 sm:px-3 py-1.5 rounded-xl font-black transition flex items-center gap-1 ${
        isAdmin 
          ? 'bg-red-600 text-white shadow-md cursor-default pointer-events-none' 
          : 'bg-[#0d182e] text-red-300 hover:bg-red-600 hover:text-white border border-red-800/80 shadow-sm'
      }" title="Switch to Admin Forest Fire Command Center (Port 8119)">
        <span>🚨</span>
        <span>${isAdmin ? 'Admin (Active)' : 'Admin Dashboard'}</span>
      </a>

      <!-- Split Demo Button -->
      <a href="${BASE_URL}/demo.html" id="fgSwitchBtnDemo" class="px-2 sm:px-2.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1 ${
        isDemo 
          ? 'bg-indigo-600 text-white shadow-md' 
          : 'text-slate-400 hover:text-indigo-200 hover:bg-indigo-950/80'
      }" title="Unified Dual Live Demo Hub (Split View)">
        <span>🔀</span>
        <span class="hidden md:inline">Split Demo</span>
      </a>

      <!-- Quick Shortcut Hint -->
      <span class="hidden lg:inline text-[9px] font-mono text-slate-400 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-700/60" title="Keyboard Shortcut">
        Alt+S
      </span>
    `;

    document.body.appendChild(dock);

    // Bind click events on the dock elements
    document.getElementById('fgSwitchBtnUser')?.addEventListener('click', (e) => {
      if (!isUser) {
        e.preventDefault();
        navigateTo('user');
      }
    });

    document.getElementById('fgSwitchBtnAdmin')?.addEventListener('click', (e) => {
      if (!isAdmin) {
        e.preventDefault();
        navigateTo('admin');
      }
    });

    document.getElementById('fgSwitchBtnDemo')?.addEventListener('click', (e) => {
      if (!isDemo) {
        e.preventDefault();
        navigateTo('demo');
      }
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initHeaderButtons();
      injectFloatingSwitcher();
    });
  } else {
    initHeaderButtons();
    injectFloatingSwitcher();
  }
})();
