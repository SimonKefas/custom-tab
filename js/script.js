(function () {
  // -------------------------
  // Public API namespace
  // -------------------------
  window.CustomTabs = window.CustomTabs || {
    _instances: new Set(),
    get(target) {
      if (!target) return null;
      let el = typeof target === 'string' ? document.querySelector(target) : target;
      return el && el._tabsInstance ? el._tabsInstance : null;
    },
    getAll() {
      return Array.from(this._instances);
    }
  };

  // Initialize after DOM is ready (safe for external CDN load order)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  function initAll() {
    document.querySelectorAll('[data-tabs]').forEach((container) => {
      // Avoid double init
      if (container._tabsInstance) return;
      const instance = createTabsInstance(container);
      container._tabsInstance = instance;
      window.CustomTabs._instances.add(instance);

      // Responsive gate
      const mql = buildMediaQuery(container);
      if (mql) {
        const apply = () => (mql.matches ? instance.enable() : instance.disable());
        // older Safari fallback
        if (mql.addEventListener) mql.addEventListener('change', apply);
        else mql.addListener(apply);
        apply();
      } else {
        instance.enable();
      }
    });
  }

  // Build a MediaQueryList from attributes (data-tabs-media OR convenience attrs)
  function buildMediaQuery(container) {
    const explicit = container.getAttribute('data-tabs-media');
    if (explicit) return window.matchMedia(explicit);

    const below = parseInt(container.getAttribute('data-tabs-disable-below'), 10);
    const above = parseInt(container.getAttribute('data-tabs-disable-above'), 10);
    const between = container.getAttribute('data-tabs-disable-between'); // "480-991"

    // Logic: we ENABLE when NOT inside the "disable" window.
    // below: disable < below  => enable mql = (min-width: below)
    if (!isNaN(below)) {
      return window.matchMedia(`(min-width: ${below}px)`);
    }
    // above: disable > above  => enable mql = (max-width: above)
    if (!isNaN(above)) {
      return window.matchMedia(`(max-width: ${above}px)`);
    }
    // between: disable between a-b  => enable outside that range:
    if (between && between.includes('-')) {
      const [aStr, bStr] = between.split('-');
      const a = parseInt(aStr, 10);
      const b = parseInt(bStr, 10);
      if (!isNaN(a) && !isNaN(b) && a <= b) {
        // enable when width <= a-1 OR width >= b+1
        // we approximate with an OR by listening to two queries and combining;
        // simpler approach: enable when (max-width:a-1) OR (min-width:b+1)
        // Use a compound check manually via resize would be overkill; instead,
        // return a synthetic mql-like object that we update on resize:
        const mqlObj = makeRangeOutsideMQL(a, b);
        return mqlObj;
      }
    }
    return null;
  }

  function makeRangeOutsideMQL(a, b) {
    const obj = { matches: false, _listeners: [] };
    const evaluate = () => {
      const w = window.innerWidth;
      const newMatches = w <= (a - 1) || w >= (b + 1);
      if (newMatches !== obj.matches) {
        obj.matches = newMatches;
        obj._listeners.forEach((fn) => fn({ matches: obj.matches }));
      }
    };
    obj.addEventListener = (type, fn) => { if (type === 'change') obj._listeners.push(fn); };
    obj.addListener = (fn) => obj._listeners.push(fn); // legacy
    window.addEventListener('resize', evaluate);
    evaluate();
    return obj;
  }

  // -------------------------
  // Tabs Instance
  // -------------------------
  function createTabsInstance(container) {
    // Options read from attributes
    const opts = readContainerOptions(container);

    // Internal state
    let enabled = false;
    let tabLinks = [];
    let contents = [];
    let tabMap = {};
    let hoverRaf = null;
    let autoplayTimer = null;
    let panelsWrapper = null;

    // Public API for this container
    const api = {
      container,
      enable,
      disable,
      destroy,
      show,
      next,
      prev,
      startAutoplay,
      stopAutoplay,
      refresh,
      setOptions,
      get isEnabled() { return enabled; },
      get links() { return tabLinks.slice(); },
      get panels() { return contents.slice(); },
      get options() { return Object.assign({}, opts); }
    };

    // --- API impl ---
    function setOptions(newOpts = {}) {
      if (typeof newOpts.mode === 'string') opts.mode = newOpts.mode;
      if (typeof newOpts.crossfade === 'boolean') opts.crossfade = newOpts.crossfade;
      if (Number.isFinite(newOpts.transitionDuration)) opts.transitionDuration = newOpts.transitionDuration;
      if (enabled) {
        // re-bind listeners cheaply
        disable();
        enable();
      }
    }

    function refresh() {
      const wasEnabled = enabled;
      if (wasEnabled) disable();
      // Recompute links/contents & map
      setupDOM();
      if (wasEnabled) enable();
    }

    function startAutoplay() {
      stopAutoplay();
      if (!Number.isFinite(opts.autoplayDelay) || opts.autoplayDelay <= 0) return;
      autoplayTimer = setInterval(() => {
        const currentIndex = tabLinks.findIndex((l) => l.classList.contains('is-active'));
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % tabLinks.length;
        show(nextIndex);
      }, opts.autoplayDelay);
    }

    function stopAutoplay() {
      if (autoplayTimer) {
        clearInterval(autoplayTimer);
        autoplayTimer = null;
      }
    }

    function next() {
      const idx = tabLinks.findIndex((l) => l.classList.contains('is-active'));
      const nextIndex = (idx + 1) % tabLinks.length;
      show(nextIndex);
    }

    function prev() {
      const idx = tabLinks.findIndex((l) => l.classList.contains('is-active'));
      const prevIndex = (idx - 1 + tabLinks.length) % tabLinks.length;
      show(prevIndex);
    }

    function show(idOrIndex) {
      if (!enabled || !tabLinks.length) return;
      let link = null;
      if (typeof idOrIndex === 'number') {
        link = tabLinks[idOrIndex] || null;
      } else {
        link = tabLinks.find((l) => l.getAttribute('data-tab-link') === idOrIndex) || null;
      }
      if (!link) return;
      activateTab(link);
    }

    function enable() {
      if (enabled) return;
      setupDOM(); // (re)compute DOM + ARIA baseline
      bindEvents();
      enabled = true;

      // Initial open
      const initial = resolveInitialLink();
      if (initial) {
        const id = initial.getAttribute('data-tab-link');
        const panel = tabMap[id] && tabMap[id].content;
        if (panel) {
          forceHideAll(); // ensure a clean slate
          showContent(panel, { crossfade: opts.crossfade, instant: true });
          markLinkActive(initial);
        }
      }

      // Autoplay (if configured)
      if (Number.isFinite(opts.autoplayDelay) && opts.autoplayDelay > 0) {
        startAutoplay();
      }

      container.dispatchEvent(new CustomEvent('tabs:enabled', { detail: { instance: api } }));
    }

    function disable() {
      if (!enabled) {
        // Still ensure all panels are visible when "disabled" is desired
        showAllPanelsPlain();
        return;
      }
      // stop timers
      stopAutoplay();
      // unbind listeners
      unbindEvents();
      // clear aria & styles, show as plain content
      teardownARIA();
      showAllPanelsPlain();
      enabled = false;
      container.dispatchEvent(new CustomEvent('tabs:disabled', { detail: { instance: api } }));
    }

    function destroy() {
      disable();
      // drop references
      tabLinks = [];
      contents = [];
      tabMap = {};
      if (container._tabsInstance) {
        delete container._tabsInstance;
      }
      window.CustomTabs._instances.delete(api);
      container.dispatchEvent(new CustomEvent('tabs:destroy', { detail: { instance: api } }));
    }

    // --- setup helpers ---
    function readLinkId(el) {
      let id = el.getAttribute('data-tab-link');
      return id && id.trim() ? id.trim() : null;
    }
    function readPanelId(el) {
      let id = el.getAttribute('data-tab-content');
      return id && id.trim() ? id.trim() : null;
    }

    function setupDOM() {
      // Read attributes (allow live updates)
      opts.mode = container.getAttribute('data-tabs-mode') || opts.mode || 'click';
      opts.defaultTab = container.getAttribute('data-tabs-default') || opts.defaultTab || null;
      opts.crossfade = container.getAttribute('data-tabs-crossfade') === 'true' || !!opts.crossfade;
      const td = parseInt(container.getAttribute('data-tabs-transition-duration'), 10);
      opts.transitionDuration = Number.isFinite(td) ? td : (opts.transitionDuration || 300);
      const ad = parseInt(container.getAttribute('data-tabs-autoplay'), 10);
      opts.autoplayDelay = Number.isFinite(ad) ? ad : (opts.autoplayDelay || 0);

      // Collect
      tabLinks = Array.from(container.querySelectorAll('[data-tab-link]'));
      contents = Array.from(container.querySelectorAll('[data-tab-content]'));

      // Auto-assign empty/missing identifiers in DOM order
      tabLinks.forEach((link, i) => {
        if (!readLinkId(link)) link.setAttribute('data-tab-link', `auto-tab-${i}`);
      });
      contents.forEach((panel, i) => {
        if (!readPanelId(panel)) panel.setAttribute('data-tab-content', `auto-tab-${i}`);
      });

      // Recollect with IDs guaranteed
      tabLinks = Array.from(container.querySelectorAll('[data-tab-link]'));
      contents = Array.from(container.querySelectorAll('[data-tab-content]'));

      // Crossfade wrapper (once)
      if (opts.crossfade) {
        panelsWrapper = container.querySelector('[data-tabs-panels]');
        if (!panelsWrapper && contents[0]) {
          panelsWrapper = document.createElement('div');
          panelsWrapper.setAttribute('data-tabs-panels', '');
          const firstPanel = contents[0];
          firstPanel.parentNode.insertBefore(panelsWrapper, firstPanel);
          contents.forEach((p) => panelsWrapper.appendChild(p));
        }
        if (panelsWrapper) panelsWrapper.style.position = 'relative';
      }

      // Map + ARIA baseline
      tabMap = {};
      contents.forEach((panel) => {
        const id = panel.getAttribute('data-tab-content');
        tabMap[id] = { content: panel };
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-hidden', 'true');
        panel.style.display = 'none';
      });

      tabLinks.forEach((link) => {
        const targetId = link.getAttribute('data-tab-link');
        link.id = link.id || `${targetId}-tab`;
        const panel = tabMap[targetId] && tabMap[targetId].content;
        link.setAttribute('role', 'tab');
        link.setAttribute('aria-selected', 'false');
        link.setAttribute('aria-expanded', 'false');
        link.setAttribute('tabindex', '0');
        if (panel) {
          if (!panel.id) panel.id = `${targetId}-content`;
          panel.setAttribute('aria-labelledby', link.id);
          link.setAttribute('aria-controls', panel.id);
        }
      });

      container.setAttribute('role', 'tablist');
    }

    function teardownARIA() {
      // Remove ARIA and role attributes added by the script
      container.removeAttribute('role');
      tabLinks.forEach((l) => {
        l.removeAttribute('role');
        l.removeAttribute('aria-selected');
        l.removeAttribute('aria-expanded');
        l.removeAttribute('tabindex');
        l.removeAttribute('aria-controls');
        l.classList.remove('is-active');
      });
      contents.forEach((p) => {
        p.removeAttribute('role');
        p.removeAttribute('aria-hidden');
        // Clean any overlay styles left by crossfade
        p.style.position = '';
        p.style.left = '';
        p.style.top = '';
        p.style.width = '';
        p.style.pointerEvents = '';
      });
      if (panelsWrapper) panelsWrapper.style.height = '';
    }

    function showAllPanelsPlain() {
      contents.forEach((panel) => {
        panel.style.display = 'block';
        panel.classList.remove('is-active');
      });
    }

    function forceHideAll() {
      contents.forEach((panel) => {
        panel.classList.remove('is-active');
        panel.setAttribute('aria-hidden', 'true');
        panel.style.display = 'none';
        // Clean crossfade overlay styles if any
        panel.style.position = '';
        panel.style.left = '';
        panel.style.top = '';
        panel.style.width = '';
        panel.style.pointerEvents = '';
      });
    }

    function resolveInitialLink() {
      if (opts.defaultTab) {
        const byId = tabLinks.find((l) => l.getAttribute('data-tab-link') === opts.defaultTab);
        if (byId) return byId;
      }
      return tabLinks[0] || null;
    }

    // ---- Event binding (with stored handlers so we can unbind on disable) ----
    function bindEvents() {
      tabLinks.forEach((link) => {
        const onKey = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activateTab(link);
          }
        };
        const onClick = (e) => {
          if (opts.mode !== 'click') return;
          e.preventDefault();
          activateTab(link);
        };
        const onHover = () => {
          if (opts.mode !== 'hover') return;
          if (hoverRaf) cancelAnimationFrame(hoverRaf);
          hoverRaf = requestAnimationFrame(() => activateTab(link));
        };

        link._tabHandlers = { onKey, onClick, onHover };
        link.addEventListener('keydown', onKey);
        link.addEventListener('click', onClick);
        link.addEventListener('mouseenter', onHover);
      });
    }

    function unbindEvents() {
      tabLinks.forEach((link) => {
        const h = link._tabHandlers;
        if (!h) return;
        link.removeEventListener('keydown', h.onKey);
        link.removeEventListener('click', h.onClick);
        link.removeEventListener('mouseenter', h.onHover);
        delete link._tabHandlers;
      });
    }

    // ---- Core tab switching ----
    function activateTab(link) {
      if (!enabled) return;
      const targetId = link.getAttribute('data-tab-link');
      const nextContent = tabMap[targetId] && tabMap[targetId].content;
      if (!nextContent) return;
      if (link.classList.contains('is-active')) return;

      // find current
      const currentLink = tabLinks.find((l) => l.classList.contains('is-active'));
      const currentContent = currentLink ? (tabMap[currentLink.getAttribute('data-tab-link')] || {}).content : null;

      // token to avoid race finalization
      container._switchToken = (container._switchToken || 0) + 1;
      const token = container._switchToken;

      // hover instant fix (no crossfade)
      if (opts.mode === 'hover' && !opts.crossfade) {
        if (currentContent) forceHide(currentContent);
        showContent(nextContent, { crossfade: false, instant: true });
        markLinkActive(link);
        return;
      }

      // crossfade or sequential switch
      if (opts.crossfade && currentContent && nextContent) {
        crossfadeSwitch(currentContent, nextContent, () => {
          if (token === container._switchToken) markLinkActive(link);
        }, opts.transitionDuration);
      } else {
        switchContent(currentContent, nextContent, () => {
          if (token === container._switchToken) markLinkActive(link);
        }, opts.transitionDuration);
      }
    }

    function markLinkActive(link) {
      tabLinks.forEach((l) => {
        l.classList.remove('is-active');
        l.setAttribute('aria-selected', 'false');
        l.setAttribute('aria-expanded', 'false');
      });
      link.classList.add('is-active');
      link.setAttribute('aria-selected', 'true');
      link.setAttribute('aria-expanded', 'true');
    }

    function switchContent(currentContent, nextContent, callback, duration) {
      if (currentContent === nextContent) {
        if (callback) callback();
        return;
      }
      if (!currentContent) {
        showContent(nextContent, { crossfade: false });
        if (callback) callback();
        return;
      }
      hideContent(currentContent, () => {
        showContent(nextContent, { crossfade: false });
        if (callback) callback();
      }, duration);
    }

    function crossfadeSwitch(current, next, done, duration) {
      const wrapper = panelsWrapper || current.parentElement;

      // overlay both
      prepareAsOverlay(current);
      prepareAsOverlay(next);

      // lock wrapper height
      const targetH = Math.max(current.offsetHeight, next.offsetHeight);
      if (wrapper) wrapper.style.height = targetH + 'px';

      // show next, fade out current
      showContent(next, { crossfade: true });
      current.classList.remove('is-active');
      current.setAttribute('aria-hidden', 'true');

      const finalize = () => {
        forceHide(current);
        cleanupOverlay(next);
        if (wrapper) wrapper.style.height = '';
        if (typeof done === 'function') done();
      };

      const onEnd = (e) => {
        if (e.propertyName !== 'opacity') return;
        current.removeEventListener('transitionend', onEnd);
        finalize();
      };
      current.addEventListener('transitionend', onEnd);
      current._hideFallback = setTimeout(() => {
        current.removeEventListener('transitionend', onEnd);
        finalize();
      }, duration);
    }

    function prepareAsOverlay(el) {
      el.style.display = 'block';
      el.style.position = 'absolute';
      el.style.left = '0';
      el.style.top = '0';
      el.style.width = '100%';
      el.style.pointerEvents = 'none';
    }
    function cleanupOverlay(el) {
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.width = '';
      el.style.pointerEvents = '';
    }

    function showContent(content, opts = {}) {
      const { crossfade = false } = opts;
      content.style.display = 'block';
      requestAnimationFrame(() => {
        content.classList.add('is-active');
        content.setAttribute('aria-hidden', 'false');
        if (!crossfade) content.style.pointerEvents = '';
        // refresh nested swipers
        refreshSwipers(content);
        // video autoplay
        const video = content.querySelector('video');
        if (video) video.play().catch(() => {});
      });
    }

    function hideContent(content, callback, duration) {
      if (!content) {
        if (callback) callback();
        return;
      }
      if (content._onTransitionEnd) {
        content.removeEventListener('transitionend', content._onTransitionEnd);
      }
      if (content._hideFallback) {
        clearTimeout(content._hideFallback);
        content._hideFallback = null;
      }
      content.classList.remove('is-active');
      content.setAttribute('aria-hidden', 'true');

      const video = content.querySelector('video');
      if (video) video.pause();

      const finalize = () => {
        content.style.display = 'none';
        if (callback) callback();
      };
      const onEnd = (e) => {
        if (e.propertyName !== 'opacity') return;
        content.removeEventListener('transitionend', onEnd);
        content._onTransitionEnd = null;
        finalize();
      };
      content._onTransitionEnd = onEnd;
      content.addEventListener('transitionend', onEnd);
      content._hideFallback = setTimeout(() => {
        content.removeEventListener('transitionend', onEnd);
        content._onTransitionEnd = null;
        finalize();
      }, duration);
    }

    function forceHide(content) {
      if (!content) return;
      if (content._onTransitionEnd) {
        content.removeEventListener('transitionend', content._onTransitionEnd);
        content._onTransitionEnd = null;
      }
      if (content._hideFallback) {
        clearTimeout(content._hideFallback);
        content._hideFallback = null;
      }
      content.classList.remove('is-active');
      content.setAttribute('aria-hidden', 'true');
      content.style.display = 'none';
      content.style.position = '';
      content.style.left = '';
      content.style.top = '';
      content.style.width = '';
      content.style.pointerEvents = '';
    }

    function refreshSwipers(scopeEl) {
      const swipers = scopeEl.querySelectorAll('.slider-main_component');
      swipers.forEach((el) => {
        if (el._swiperInstance && typeof el._swiperInstance.update === 'function') {
          el._swiperInstance.update();
        }
      });
    }

    return api;
  }

  function readContainerOptions(container) {
    return {
      mode: container.getAttribute('data-tabs-mode') || 'click',
      defaultTab: container.getAttribute('data-tabs-default') || null,
      autoplayDelay: parseInt(container.getAttribute('data-tabs-autoplay'), 10) || 0,
      transitionDuration: parseInt(container.getAttribute('data-tabs-transition-duration'), 10) || 300,
      crossfade: container.getAttribute('data-tabs-crossfade') === 'true'
    };
  }
})();
