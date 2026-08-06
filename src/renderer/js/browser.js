'use strict';

/**
 * browser.js
 * ------------------------------------------------------------------
 * The "Browser" panel — lives in the same left sidebar as Explorer /
 * Stats / Tools / Cloud (click the compass icon on the activity rail
 * to switch to it), backed by an Electron <webview>, so you can look
 * something up, ask an AI assistant, or check reference material
 * right next to your document without ever leaving poagitText Pro.
 *
 * The <webview> tag runs the page in its own out-of-process guest
 * (separate from the app's own renderer, which still has no Node
 * access at all — see preload.js), so nothing it loads can reach
 * into the editor's context. Popups it opens (e.g. a Google sign-in
 * window) are handled in the main process; see main.js.
 *
 * A mobile (Android Chrome) User-Agent is set directly on the <webview>
 * element in index.html. This does double duty: it gets past "please
 * use a supported/modern browser" gates some sites throw at unknown
 * UAs, and — more importantly for a narrow sidebar — it makes sites
 * like Google, Wikipedia, and Bing serve their mobile-optimized markup
 * instead of a desktop layout, which is what actually fits a ~300–380px
 * panel without constant left-right scrolling. A `dom-ready` handler
 * below also force-sets a `width=device-width` viewport meta tag as a
 * safety net for older/simpler pages that don't ship a good one of
 * their own. The underlying page engine is still whatever Chromium
 * ships with this app's Electron version, so a handful of very new web
 * APIs a site might use are still out of reach.
 * ------------------------------------------------------------------
 */

PT.browser = (() => {
  const HOME_URL = 'https://www.google.com';

  let webview = null;
  let addressForm = null;
  let addressInput = null;
  let addressIcon = null;
  let loadingBar = null;
  let hasLoadedOnce = false;

  function els() {
    webview = document.getElementById('browserWebview');
    addressForm = document.getElementById('browserAddressForm');
    addressInput = document.getElementById('browserAddressInput');
    addressIcon = document.getElementById('browserAddressIcon');
    loadingBar = document.getElementById('browserLoadingBar');
  }

  /** Turns whatever the user typed into a real navigable URL. Bare
   *  words/phrases become a Google search, like every normal browser
   *  address bar does. */
  function resolveInput(raw) {
    const value = (raw || '').trim();
    if (!value) return HOME_URL;

    const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ||
      (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/i.test(value) && !value.includes(' '));

    if (looksLikeUrl) {
      return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    }
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  }

  function go(url) {
    if (!webview) return;
    const target = resolveInput(url);
    if (typeof webview.loadURL === 'function') {
      webview.loadURL(target).catch(() => {});
    } else {
      webview.src = target;
    }
  }

  function updateAddressBar(url) {
    if (!addressInput || document.activeElement === addressInput) return;
    addressInput.value = url && url !== 'about:blank' ? url : '';
    if (addressIcon) {
      addressIcon.className = url && url.startsWith('https://')
        ? 'fa-solid fa-lock browser-address-icon'
        : 'fa-solid fa-lock-open browser-address-icon';
    }
  }

  function updateNavButtons() {
    if (!webview || typeof webview.canGoBack !== 'function') return;
    document.getElementById('browserBackBtn').classList.toggle('is-disabled', !webview.canGoBack());
    document.getElementById('browserForwardBtn').classList.toggle('is-disabled', !webview.canGoForward());
  }

  function wireWebview() {
    webview.addEventListener('did-start-loading', () => loadingBar?.classList.add('loading'));
    webview.addEventListener('did-stop-loading', () => {
      loadingBar?.classList.remove('loading');
      updateNavButtons();
    });
    webview.addEventListener('did-navigate', (e) => updateAddressBar(e.url));
    webview.addEventListener('did-navigate-in-page', (e) => updateAddressBar(e.url));
    webview.addEventListener('page-title-updated', () => updateNavButtons());
    // Belt-and-suspenders for the mobile User-Agent above: force a proper
    // device-width viewport on every page, in case the page's own
    // viewport meta tag is missing or written for a desktop layout.
    webview.addEventListener('dom-ready', () => {
      webview.executeJavaScript(`
        (function () {
          var vp = document.querySelector('meta[name="viewport"]');
          if (!vp) {
            vp = document.createElement('meta');
            vp.setAttribute('name', 'viewport');
            (document.head || document.documentElement).appendChild(vp);
          }
          vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1');
        })();
      `).catch(() => {});
    });
    webview.addEventListener('did-fail-load', (e) => {
      // -3 is a load being superseded by a newer navigation — not a real error.
      if (e.errorCode === -3 || !e.isMainFrame) return;
      loadingBar?.classList.remove('loading');
      webview.executeJavaScript(`
        document.documentElement.innerHTML =
          '<div style="font-family: -apple-system, sans-serif; padding: 40px 16px; text-align:center; color:#666;">' +
          '<h3 style="margin-bottom:8px;">This page couldn\\'t load</h3>' +
          '<p style="font-size:13px;">${(e.errorDescription || 'Unknown error').replace(/'/g, "\\\\'")}</p></div>';
      `).catch(() => {});
    });
  }

  /** Called by PT.ui.showPanel() every time the Browser panel becomes
   *  the visible sidebar panel — lazily wires the webview and loads
   *  the homepage the first time only. */
  function onShown() {
    els();
    if (!webview.dataset.wired) {
      wireWebview();
      webview.dataset.wired = '1';
    }
    if (!hasLoadedOnce) {
      hasLoadedOnce = true;
      go(HOME_URL);
    }
  }

  function wire() {
    els();

    addressForm.addEventListener('submit', (e) => {
      e.preventDefault();
      go(addressInput.value);
      addressInput.blur();
    });

    document.getElementById('browserBackBtn').addEventListener('click', () => webview.canGoBack() && webview.goBack());
    document.getElementById('browserForwardBtn').addEventListener('click', () => webview.canGoForward() && webview.goForward());
    document.getElementById('browserReloadBtn').addEventListener('click', () => webview.reload());
    document.getElementById('browserHomeBtn').addEventListener('click', () => go(HOME_URL));
    document.getElementById('browserOpenExternalBtn').addEventListener('click', () => {
      const url = webview.getURL ? webview.getURL() : addressInput.value;
      if (url) window.poagit.app.openExternal(url);
    });

    document.getElementById('browserQuickLinks').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-browser-go]');
      if (btn) go(btn.dataset.browserGo);
    });
  }

  return { wire, onShown };
})();
