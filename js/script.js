(function () {
  // ---------------- Public API ----------------
  window.CustomTabs = window.CustomTabs || {
    _instances: new Set(),
    get(target) {
      if (!target) return null;
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      return el && el._tabsInstance ? el._tabsInstance : null;
    },
    getAll() { return Array.from(this._instances); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  function initAll() {
    document.querySelectorAll('[data-tabs]').forEach((container) => {
      if (container._tabsInstance) return;
      const instance = createTabsInstance(container);
      container._tabsInstance = instance;
      window.CustomTabs._instances.add(instance);
      instance.enable();
    });
  }

  // MQL helpers
  function mqlFromBelowAttr(el, attrName) {
    const v = parseInt(el.getAttribute(attrName), 10);
    return Number.isFinite(v) ? window.matchMedia(`(max-width:${v - 1}px)`) : null;
  }
  function mqlFromExplicit(el, attrName) {
    const q = el.getAttribute(attrName);
    return q ? window.matchMedia(q) : null;
  }

  // ---------------- Instance ----------------
  function createTabsInstance(container) {
    const opts = readContainerOptions(container);

    // State
    let enabled = false;
    let isAccordion = false;
    let tabLinks = [];
    let contents = [];
    let tabMap = {};
    let hoverRaf = null;
    let autoplayTimer = null;
    let panelsWrapper = null;
    let accordionMQL = null;

    // Remember original location to restore in tabs mode
    const origins = new Map(); // panelEl -> { parent, nextSibling }

    const api = {
      container,
      enable, disable, destroy, refresh,
      show, next, prev,
      startAutoplay, stopAutoplay,
      setOptions,
      setAccordion,
      syncAccordionSlots,
      get isEnabled() { return enabled; },
      get isAccordion() { return isAccordion; },
      get links() { return tabLinks.slice(); },
      get panels() { return contents.slice(); },
      get options() { return Object.assign({}, opts); }
    };

    // --------- lifecycle ---------
    function enable() {
      if (enabled) return;
      setupDOM();
      setupAccordionMQL();
      bindEvents();
      enabled = true;

      if (!isAccordion) {
        const initial = resolveInitialLink();
        if (initial) {
          const id = initial.getAttribute('data-tab-link');
          const panel = tabMap[id] && tabMap[id].content;
          if (panel) {
            forceHideAll();
            showContent(panel, { crossfade: opts.crossfade, instant: true });
            markLinkActive(initial);
          }
        }
      } else {
        // Move panels into slots and open the initial one instantly
        syncAccordionSlots();
        openInitialAccordion({ instant: true });
      }

      if (!isAccordion && Number.isFinite(opts.autoplayDelay) && opts.autoplayDelay > 0) {
        startAutoplay();
      }

      container.dispatchEvent(new CustomEvent('tabs:enabled', { detail: { instance: api } }));
    }

    function disable() {
      if (!enabled) {
        showAllPanelsPlain();
        return;
      }
      stopAutoplay();
      unbindEvents();
      teardownARIA();
      showAllPanelsPlain();
      if (isAccordion) movePanelsBackToOrigin();
      enabled = false;
      container.dispatchEvent(new CustomEvent('tabs:disabled', { detail: { instance: api } }));
    }

    function destroy() {
      disable();
      tabLinks = [];
      contents = [];
      tabMap = {};
      if (container._tabsInstance) delete container._tabsInstance;
      window.CustomTabs._instances.delete(api);
      container.dispatchEvent(new CustomEvent('tabs:destroy', { detail: { instance: api } }));
    }

    function refresh() {
      const wasEnabled = enabled;
      const wasAccordion = isAccordion;
      if (wasEnabled) disable();
      setupDOM();
      if (wasEnabled) {
        enable();
        if (wasAccordion !== isAccordion) setAccordion(wasAccordion);
      }
    }

    // --------- options / responsive ---------
    function setOptions(newOpts = {}) {
      if (typeof newOpts.mode === 'string') opts.mode = newOpts.mode;
      if (typeof newOpts.crossfade === 'boolean') opts.crossfade = newOpts.crossfade;
      if (Number.isFinite(newOpts.transitionDuration)) opts.transitionDuration = newOpts.transitionDuration;
      if (typeof newOpts.accordionMultiple === 'boolean') opts.accordionMultiple = newOpts.accordionMultiple;
      if (Number.isFinite(newOpts.accordionDuration)) opts.accordionDuration = newOpts.accordionDuration;
      if (enabled) { disable(); enable(); }
    }

    function setupAccordionMQL() {
      accordionMQL =
        mqlFromExplicit(container, 'data-tabs-accordion-media') ||
        mqlFromBelowAttr(container, 'data-tabs-accordion-below');

      if (accordionMQL) {
        const apply = () => setAccordion(accordionMQL.matches);
        if (accordionMQL.addEventListener) accordionMQL.addEventListener('change', apply);
        else accordionMQL.addListener(apply);
        apply();
      } else {
        setAccordion(false);
      }
    }

    function setContainerModeClass() {
      container.classList.toggle('is-accordion', isAccordion);
      container.classList.toggle('is-tabs', !isAccordion);
    }

    function getActiveLink() {
      return tabLinks.find(l => l.classList.contains('is-active')) || null;
    }

    function openInitialAccordion({ instant = false } = {}) {
      const active = getActiveLink();
      const initial = active || resolveInitialLink();
      syncAccordionSlots();
      if (initial) {
        const id = initial.getAttribute('data-tab-link');
        const panel = tabMap[id] && tabMap[id].content;
        if (panel) {
          collapseAllAccordion({ instant: true, except: panel });
          expand(panel, initial, { instant });
          return;
        }
      }
      collapseAllAccordion({ instant: true });
    }

    function setAccordion(shouldBeAccordion) {
      const target = !!shouldBeAccordion;
      if (!enabled) { isAccordion = target; return; }
      if (isAccordion === target) return;

      stopAutoplay();
      if (target) {
        contents.forEach(rememberOrigin);
        syncAccordionSlots();
        isAccordion = true;
        setContainerModeClass();
        updateARIAForAccordion();
        openInitialAccordion({ instant: true });

        window.addEventListener('resize', onResizeSync, { passive: true });
      } else {
        window.removeEventListener('resize', onResizeSync);
        movePanelsBackToOrigin();
        isAccordion = false;
        setContainerModeClass();
        updateARIAForTabs();
        forceHideAll();
        const initial = resolveInitialLink();
        if (initial) {
          const id = initial.getAttribute('data-tab-link');
          const p = tabMap[id] && tabMap[id].content;
          if (p) {
            showContent(p, { crossfade: opts.crossfade, instant: true });
            markLinkActive(initial);
          }
        }
        if (Number.isFinite(opts.autoplayDelay) && opts.autoplayDelay > 0) startAutoplay();
      }
    }

    function onResizeSync() {
      if (isAccordion) syncAccordionSlots();
    }

    // --------- DOM / ARIA ---------
    function setupDOM() {
      // Read attributes
      opts.mode = container.getAttribute('data-tabs-mode') || opts.mode || 'click';
      opts.defaultTab = container.getAttribute('data-tabs-default') || opts.defaultTab || null;
      opts.crossfade = container.getAttribute('data-tabs-crossfade') === 'true' || !!opts.crossfade;
      const td = parseInt(container.getAttribute('data-tabs-transition-duration'), 10);
      opts.transitionDuration = Number.isFinite(td) ? td : (opts.transitionDuration || 300);
      const ad = parseInt(container.getAttribute('data-tabs-autoplay'), 10);
      opts.autoplayDelay = Number.isFinite(ad) ? ad : (opts.autoplayDelay || 0);
      opts.accordionMultiple = container.getAttribute('data-tabs-accordion-multiple') === 'true' || !!opts.accordionMultiple;
      const accDur = parseInt(container.getAttribute('data-tabs-accordion-duration'), 10);
      opts.accordionDuration = Number.isFinite(accDur) ? accDur : (opts.accordionDuration || 300);

      // Collect links/panels
      tabLinks = Array.from(container.querySelectorAll('[data-tab-link]'));
      contents = Array.from(container.querySelectorAll('[data-tab-content]'));

      tabLinks.forEach((link, i) => { if (!link.getAttribute('data-tab-link')) link.setAttribute('data-tab-link', `auto-tab-${i}`); });
      contents.forEach((panel, i) => { if (!panel.getAttribute('data-tab-content')) panel.setAttribute('data-tab-content', `auto-tab-${i}`); });

      // Re-read to ensure
      tabLinks = Array.from(container.querySelectorAll('[data-tab-link]'));
      contents = Array.from(container.querySelectorAll('[data-tab-content]'));

      // Optional crossfade wrapper (tabs)
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

      // Map
      tabMap = {};
      contents.forEach((panel) => {
        const id = panel.getAttribute('data-tab-content');
        tabMap[id] = { content: panel };
      });

      updateARIAForTabs();
    }

    function updateARIAForTabs() {
      container.setAttribute('role', 'tablist');
      container.classList.add('is-tabs');
      container.classList.remove('is-accordion');
      contents.forEach((panel) => {
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-hidden', 'true');
        panel.style.display = 'none';
        panel.style.overflow = '';
        panel.style.height = '';
        panel.style.opacity = ''; // clear any inline opacity from accordion
      });
      tabLinks.forEach((link) => {
        const id = link.getAttribute('data-tab-link');
        const panel = tabMap[id] && tabMap[id].content;
        link.id = link.id || `${id}-tab`;
        link.setAttribute('role', 'tab');
        link.setAttribute('aria-selected', 'false');
        link.setAttribute('aria-expanded', 'false');
        link.setAttribute('tabindex', '0');
        if (panel) {
          if (!panel.id) panel.id = `${id}-content`;
          panel.setAttribute('aria-labelledby', link.id);
          link.setAttribute('aria-controls', panel.id);
        }
        link.classList.remove('is-open');
      });
      contents.forEach((p) => p.classList.remove('is-open'));
    }

    function updateARIAForAccordion() {
      container.removeAttribute('role');
      container.classList.add('is-accordion');
      container.classList.remove('is-tabs');
      tabLinks.forEach((link) => {
        const id = link.getAttribute('data-tab-link');
        const panel = tabMap[id] && tabMap[id].content;
        link.setAttribute('role', 'button');
        link.setAttribute('aria-expanded', 'false');
        link.setAttribute('tabindex', '0');
        if (panel) {
          if (!panel.id) panel.id = `${id}-content`;
          link.setAttribute('aria-controls', panel.id);
          panel.setAttribute('role', 'region');
          panel.setAttribute('aria-labelledby', link.id || `${id}-tab`);
        }
        link.classList.remove('is-active');
        link.removeAttribute('aria-selected');
      });
    }

    function teardownARIA() {
      container.removeAttribute('role');
      container.classList.remove('is-accordion', 'is-tabs');
      tabLinks.forEach((l) => {
        l.removeAttribute('role');
        l.removeAttribute('aria-selected');
        l.removeAttribute('aria-expanded');
        l.removeAttribute('tabindex');
        l.removeAttribute('aria-controls');
        l.classList.remove('is-active', 'is-open');
      });
      contents.forEach((p) => {
        p.removeAttribute('role');
        p.removeAttribute('aria-hidden');
        p.removeAttribute('aria-labelledby');
        p.classList.remove('is-open');
        p.style.position = '';
        p.style.left = '';
        p.style.top = '';
        p.style.width = '';
        p.style.pointerEvents = '';
        p.style.overflow = '';
        p.style.height = '';
        p.style.opacity = '';
      });
      if (panelsWrapper) panelsWrapper.style.height = '';
    }

    // --------- slotting (robust for Webflow) ---------
    function isSlotEl(el) {
      return !!el && (el.hasAttribute('data-tab-acc-slot') ||
                      (el.classList && (el.classList.contains('tabs__acc-slot') || el.classList.contains('tab-acc-slot'))));
    }
    function hasEmptyOrMissingAccSlot(el) {
      if (!isSlotEl(el)) return false;
      const v = el.getAttribute('data-tab-acc-slot');
      return v === null || v === '';
    }
    function insertionAnchorFor(trigger) {
      return trigger.closest('li, .tabs__item, .tabs_list_item') || trigger;
    }
    function findOrCreateAccordionSlot(id) {
      // 1) exact match
      let slot = container.querySelector(`[data-tab-acc-slot="${id}"]`);
      if (slot) return slot;

      // 2) near trigger
      const trigger = tabLinks.find((l) => l.getAttribute('data-tab-link') === id);
      const anchor  = trigger ? insertionAnchorFor(trigger) : null;

      if (anchor && hasEmptyOrMissingAccSlot(anchor.nextElementSibling)) {
        slot = anchor.nextElementSibling;
      }
      if (!slot && anchor && anchor.parentNode) {
        slot = Array.from(anchor.parentNode.children).find(hasEmptyOrMissingAccSlot) || null;
      }
      if (!slot) {
        slot = container.querySelector(
          '.tabs__acc-slot[data-tab-acc-slot=""], .tab-acc-slot[data-tab-acc-slot=""], ' +
          '.tabs__acc-slot:not([data-tab-acc-slot]), .tab-acc-slot:not([data-tab-acc-slot])'
        );
      }

      if (slot && (!slot.hasAttribute('data-tab-acc-slot') || slot.getAttribute('data-tab-acc-slot') === '')) {
        slot.setAttribute('data-tab-acc-slot', id);
        return slot;
      }

      // Create one after anchor
      slot = document.createElement('div');
      slot.className = 'tab-acc-slot';
      slot.setAttribute('data-tab-acc-slot', id);
      slot._autoCreated = true;

      if (anchor && anchor.insertAdjacentElement) {
        anchor.insertAdjacentElement('afterend', slot);
      } else if (trigger && trigger.parentNode) {
        trigger.parentNode.insertBefore(slot, trigger.nextSibling);
      } else {
        container.appendChild(slot);
      }
      return slot;
    }

    function rememberOrigin(panel) {
      if (origins.has(panel)) return;
      origins.set(panel, { parent: panel.parentNode, nextSibling: panel.nextSibling });
    }

    function movePanelToAccordionSlot(panel) {
      const id = panel.getAttribute('data-tab-content');
      const slot = findOrCreateAccordionSlot(id);
      if (!slot) return;

      if (panel.parentNode !== slot) slot.appendChild(panel);

      // Prep for accordion animation
      panel.style.display = 'block';
      panel.style.overflow = 'hidden';
      panel.style.height = '0px';
      panel.style.opacity = '0'; // collapsed starts invisible
      panel.classList.remove('is-active');
      panel.setAttribute('aria-hidden', 'true');
    }

    function movePanelsBackToOrigin() {
      contents.forEach((panel) => {
        const o = origins.get(panel);
        if (!o || !o.parent) return;
        o.parent.insertBefore(panel, o.nextSibling);
        const slot = container.querySelector(`[data-tab-acc-slot="${panel.getAttribute('data-tab-content')}"]`);
        if (slot && slot._autoCreated && slot.parentNode) slot.parentNode.removeChild(slot);
      });
    }

    function syncAccordionSlots() {
      contents.forEach(rememberOrigin);
      contents.forEach(movePanelToAccordionSlot);
    }

    // --------- events ---------
    function bindEvents() {
      tabLinks.forEach((link) => {
        const onKey = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isAccordion) toggleAccordion(link);
            else activateTab(link);
          }
        };
        const onClick = (e) => {
          e.preventDefault();
          if (isAccordion) toggleAccordion(link);
          else if (opts.mode === 'click') activateTab(link);
        };
        const onHover = () => {
          if (!isAccordion && opts.mode === 'hover') {
            if (hoverRaf) cancelAnimationFrame(hoverRaf);
            hoverRaf = requestAnimationFrame(() => activateTab(link));
          }
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
      window.removeEventListener('resize', onResizeSync);
    }

    // --------- tabs switching ---------
    function activateTab(link) {
      if (!enabled || isAccordion) return;
      const targetId = link.getAttribute('data-tab-link');
      const nextContent = tabMap[targetId] && tabMap[targetId].content; // fixed typo/leak
      if (!nextContent) return;
      if (link.classList.contains('is-active')) return;

      const currentLink = tabLinks.find((l) => l.classList.contains('is-active'));
      const currentContent = currentLink ? (tabMap[currentLink.getAttribute('data-tab-link')] || {}).content : null;

      container._switchToken = (container._switchToken || 0) + 1;
      const token = container._switchToken;

      if (opts.mode === 'hover' && !opts.crossfade) {
        if (currentContent) forceHide(currentContent);
        showContent(nextContent, { crossfade: false, instant: true });
        markLinkActive(link);
        return;
      }

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
      if (currentContent === nextContent) { if (callback) callback(); return; }
      if (!currentContent) { showContent(nextContent, { crossfade: false }); if (callback) callback(); return; }
      hideContent(currentContent, () => {
        showContent(nextContent, { crossfade: false });
        if (callback) callback();
      }, duration);
    }

    function crossfadeSwitch(current, next, done, duration) {
      const wrapper = panelsWrapper || current.parentElement;
      prepareAsOverlay(current);
      prepareAsOverlay(next);
      const targetH = Math.max(current.offsetHeight, next.offsetHeight);
      if (wrapper) wrapper.style.height = targetH + 'px';
      showContent(next, { crossfade: true });
      current.classList.remove('is-active');
      current.setAttribute('aria-hidden', 'true');

      const finalize = () => {
        forceHide(current);
        cleanupOverlay(next);
        if (wrapper) wrapper.style.height = '';
        if (typeof done === 'function') done();
      };
      const onEnd = (e) => { if (e.propertyName !== 'opacity') return; current.removeEventListener('transitionend', onEnd); finalize(); };
      current.addEventListener('transitionend', onEnd);
      current._hideFallback = setTimeout(() => { current.removeEventListener('transitionend', onEnd); finalize(); }, duration);
    }

    // Immediate hide/show helpers
    function forceHide(panel) {
      if (!panel) return;
      panel.classList.remove('is-active', 'is-open');
      panel.setAttribute('aria-hidden', 'true');
      panel.style.display = 'none';
      panel.style.position = '';
      panel.style.left = '';
      panel.style.top = '';
      panel.style.width = '';
      panel.style.pointerEvents = '';
      // stop autoplay in hidden panels (safety)
      stopAutoplayIn(panel);
    }
    function forceHideAll() {
      contents.forEach((panel) => {
        panel.classList.remove('is-active', 'is-open');
        panel.setAttribute('aria-hidden', 'true');
        panel.style.display = 'none';
        panel.style.position = '';
        panel.style.left = '';
        panel.style.top = '';
        panel.style.width = '';
        panel.style.pointerEvents = '';
        if (isAccordion) {
          panel.style.overflow = 'hidden';
          panel.style.height = '0px';
          panel.style.opacity = '0';
        } else {
          panel.style.overflow = '';
          panel.style.height = '';
          panel.style.opacity = '';
        }
        stopAutoplayIn(panel);
      });
      tabLinks.forEach((link) => {
        link.classList.remove('is-active', 'is-open');
        link.setAttribute('aria-selected', 'false');
        link.setAttribute('aria-expanded', 'false');
      });
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
      el.style.position = ''; el.style.left = ''; el.style.top = ''; el.style.width = ''; el.style.pointerEvents = '';
    }

    function showContent(content, opts = {}) {
      const { crossfade = false } = opts;
      content.style.display = 'block';
      requestAnimationFrame(() => {
        content.classList.add('is-active');
        content.setAttribute('aria-hidden', 'false');
        if (!crossfade) content.style.pointerEvents = '';
        refreshSwipers(content);
        startAutoplayIn(content);
        const video = content.querySelector('video');
        if (video) video.play().catch(() => {});
      });
    }

    function hideContent(content, callback, duration) {
      if (!content) { if (callback) callback(); return; }
      if (content._onTransitionEnd) content.removeEventListener('transitionend', content._onTransitionEnd);
      if (content._hideFallback) { clearTimeout(content._hideFallback); content._hideFallback = null; }
      content.classList.remove('is-active');
      content.setAttribute('aria-hidden', 'true');
      stopAutoplayIn(content);
      const video = content.querySelector('video'); if (video) video.pause();
      const finalize = () => { content.style.display = 'none'; if (callback) callback(); };
      const onEnd = (e) => { if (e.propertyName !== 'opacity') return; content.removeEventListener('transitionend', onEnd); content._onTransitionEnd = null; finalize(); };
      content._onTransitionEnd = onEnd;
      content.addEventListener('transitionend', onEnd);
      content._hideFallback = setTimeout(() => { content.removeEventListener('transitionend', onEnd); content._onTransitionEnd = null; finalize(); }, duration);
    }

    // --------- accordion behavior ---------
    function toggleAccordion(link) {
      const id = link.getAttribute('data-tab-link');
      const panel = tabMap[id] && tabMap[id].content;
      if (!panel) return;

      const isOpen = panel.getAttribute('aria-hidden') === 'false';
      if (isOpen) {
        collapse(panel, link);
      } else {
        if (!opts.accordionMultiple) collapseAllAccordion({ except: panel });
        expand(panel, link);
      }
    }

    function clearAccordionTransition(panel) {
      if (panel._accOnEnd) {
        panel.removeEventListener('transitionend', panel._accOnEnd);
        panel._accOnEnd = null;
      }
      panel.style.transition = '';
    }

    function expand(panel, link, options = {}) {
      const instant = options.instant === true;
      clearAccordionTransition(panel);

      // Ensure panel is in its slot
      const id = panel.getAttribute('data-tab-content');
      const slot = findOrCreateAccordionSlot(id);
      if (panel.parentNode !== slot) slot.appendChild(panel);

      if (link) {
        link.setAttribute('aria-expanded', 'true');
        link.classList.add('is-open');
      }
      panel.classList.add('is-open');
      panel.setAttribute('aria-hidden', 'false');

      if (instant) {
        panel.style.transition = '';
        panel.style.height = 'auto';
        panel.style.opacity = '1';
        refreshSwipers(panel);
        startAutoplayIn(panel);
        const video = panel.querySelector('video'); if (video) video.play().catch(() => {});
        container.dispatchEvent(new CustomEvent('tabs:accordion:expanded', { detail: { panel, link } }));
        return;
      }

      // Animated open
      const startH = panel.offsetHeight;
      panel.style.height = startH + 'px';
      const target = panel.scrollHeight;

      requestAnimationFrame(() => {
        panel.style.transition = `height ${opts.accordionDuration}ms ease`;
        panel.style.height = target + 'px';
        panel.style.opacity = '1';
      });

      panel._accOnEnd = (e) => {
        if (e.target !== panel || e.propertyName !== 'height') return;
        panel.removeEventListener('transitionend', panel._accOnEnd);
        panel._accOnEnd = null;
        panel.style.transition = '';
        panel.style.height = 'auto';
        panel.style.opacity = '1';
        refreshSwipers(panel);
        startAutoplayIn(panel);
        const video = panel.querySelector('video'); if (video) video.play().catch(() => {});
      };
      panel.addEventListener('transitionend', panel._accOnEnd);

      container.dispatchEvent(new CustomEvent('tabs:accordion:expanded', { detail: { panel, link } }));
    }

    function collapse(panel, link, options = {}) {
      const instant = options.instant === true;
      clearAccordionTransition(panel);

      if (link) {
        link.setAttribute('aria-expanded', 'false');
        link.classList.remove('is-open');
      }
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');

      stopAutoplayIn(panel);

      if (instant) {
        panel.style.transition = '';
        panel.style.height = '0px';
        panel.style.opacity = '0';
        const video = panel.querySelector('video'); if (video) video.pause();
        container.dispatchEvent(new CustomEvent('tabs:accordion:collapsed', { detail: { panel, link } }));
        return;
      }

      const startH = panel.offsetHeight;
      panel.style.height = startH + 'px';

      requestAnimationFrame(() => {
        panel.style.transition = `height ${opts.accordionDuration}ms ease`;
        panel.style.height = '0px';
        panel.style.opacity = '0';
      });

      panel._accOnEnd = (e) => {
        if (e.target !== panel || e.propertyName !== 'height') return;
        panel.removeEventListener('transitionend', panel._accOnEnd);
        panel._accOnEnd = null;
        panel.style.transition = '';
        panel.style.height = '0px';
        panel.style.opacity = '0';
        const video = panel.querySelector('video'); if (video) video.pause();
      };
      panel.addEventListener('transitionend', panel._accOnEnd);

      container.dispatchEvent(new CustomEvent('tabs:accordion:collapsed', { detail: { panel, link } }));
    }

    function collapseAllAccordion({ instant = false, except = null } = {}) {
      tabLinks.forEach((link) => {
        const id = link.getAttribute('data-tab-link');
        const panel = tabMap[id] && tabMap[id].content;
        if (panel && panel === except) return;
        link.setAttribute('aria-expanded', 'false');
        link.classList.remove('is-open');
      });

      contents.forEach((panel) => {
        if (panel === except) return;
        clearAccordionTransition(panel);
        panel.setAttribute('aria-hidden', 'true');
        panel.classList.remove('is-open');
        stopAutoplayIn(panel);
        if (instant) {
          panel.style.transition = '';
          panel.style.height = '0px';
          panel.style.opacity = '0';
          const video = panel.querySelector('video'); if (video) video.pause();
        } else {
          collapse(panel);
        }
      });
    }

    // --------- Swiper helpers ---------
    function stopAutoplayIn(scopeEl) {
      scopeEl.querySelectorAll('.slider-main_component').forEach((el) => {
        const sw = el._swiperInstance;
        try {
          if (sw && sw.autoplay && sw.autoplay.running && typeof sw.autoplay.stop === 'function') {
            sw.autoplay.stop();
          }
        } catch (e) {}
      });
    }
    function startAutoplayIn(scopeEl) {
      scopeEl.querySelectorAll('.slider-main_component').forEach((el) => {
        const sw = el._swiperInstance;
        try {
          const visible = el.closest('[data-tab-content]')?.getAttribute('aria-hidden') === 'false';
          if (sw && sw.autoplay && typeof sw.autoplay.start === 'function' && visible && !sw.autoplay.running) {
            sw.autoplay.start();
          }
        } catch (e) {}
      });
    }

    function refreshSwipers(scopeEl) {
      const els = scopeEl.querySelectorAll('.slider-main_component');
      els.forEach((el) => {
        const swiper = el._swiperInstance;
        if (!swiper || typeof swiper.update !== 'function') return;

        // Pause autoplay during heavy updates to avoid race/jitter
        const hadAutoplay = !!(swiper.autoplay && swiper.autoplay.running);
        try { if (hadAutoplay && swiper.autoplay.stop) swiper.autoplay.stop(); } catch (e) {}

        // 1) Ensure layout is current
        swiper.update();

        // 2) After layout settles, loop fixes / normalization
        requestAnimationFrame(() => {
          try {
            const slides = Array.from(swiper.slides || []);
            const realCount = new Set(
              slides.map((s, i) => {
                const v = s.getAttribute && s.getAttribute('data-swiper-slide-index');
                return v != null ? v : i;
              })
            ).size;

            if (swiper.params) {
              // Disable loop when 1–2 real slides to avoid oscillation
              if (swiper.params.loop && realCount <= 2) {
                if (typeof swiper.loopDestroy === 'function') swiper.loopDestroy();
                swiper.params.loop = false;
                if (typeof swiper.update === 'function') swiper.update();
              } else if (swiper.params.loop && realCount > 1) {
                // Keep loop healthy
                if (typeof swiper.fixLoop === 'function') {
                  swiper.fixLoop();
                } else if (typeof swiper.loopDestroy === 'function' && typeof swiper.loopCreate === 'function') {
                  swiper.loopDestroy();
                  swiper.loopCreate();
                }
                if (typeof swiper.updateSlidesClasses === 'function') swiper.updateSlidesClasses();
                if (typeof swiper.updateProgress === 'function') swiper.updateProgress();
              }
            }

            // Normalize position without transition
            if (typeof swiper.slideToLoop === 'function' && Number.isFinite(swiper.realIndex)) {
              swiper.slideToLoop(swiper.realIndex, 0, false);
            } else if (typeof swiper.slideTo === 'function') {
              swiper.slideTo(swiper.activeIndex || 0, 0, false);
            }
          } catch (e) {}

          // 3) Resume autoplay only if panel is visible
          try {
            const isVisible = el.closest('[data-tab-content]')?.getAttribute('aria-hidden') === 'false';
            if (hadAutoplay && isVisible && swiper.autoplay && !swiper.autoplay.running && swiper.autoplay.start) {
              swiper.autoplay.start();
            }
          } catch (e) {}

          el.dispatchEvent(new CustomEvent('slider:updated', { detail: { swiper } }));
        });
      });
    }

    // --------- autoplay (tabs only) ---------
    function startAutoplay() {
      stopAutoplay();
      if (isAccordion) return;
      if (!Number.isFinite(opts.autoplayDelay) || opts.autoplayDelay <= 0) return;
      autoplayTimer = setInterval(() => {
        const idx = tabLinks.findIndex((l) => l.classList.contains('is-active'));
        const nextIndex = idx === -1 ? 0 : (idx + 1) % tabLinks.length;
        show(nextIndex);
      }, opts.autoplayDelay);
    }
    function stopAutoplay() {
      if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }
    }

    // --------- public actions ---------
    function show(idOrIndex) {
      if (!enabled) return;
      if (isAccordion) {
        let link = null;
        if (typeof idOrIndex === 'number') link = tabLinks[idOrIndex] || null;
        else link = tabLinks.find((l) => l.getAttribute('data-tab-link') === idOrIndex) || null;
        if (link) {
          const id = link.getAttribute('data-tab-link');
          const panel = tabMap[id] && tabMap[id].content;
          if (panel) {
            if (!opts.accordionMultiple) collapseAllAccordion({ except: panel });
            expand(panel, link);
          }
        }
        return;
      }
      let link = null;
      if (typeof idOrIndex === 'number') link = tabLinks[idOrIndex] || null;
      else link = tabLinks.find((l) => l.getAttribute('data-tab-link') === idOrIndex) || null;
      if (link) activateTab(link);
    }
    function next() { if (isAccordion) return; const i = tabLinks.findIndex((l) => l.classList.contains('is-active')); show((i + 1) % tabLinks.length); }
    function prev() { if (isAccordion) return; const i = tabLinks.findIndex((l) => l.classList.contains('is-active')); show((i - 1 + tabLinks.length) % tabLinks.length); }

    // --------- helpers ---------
    function resolveInitialLink() {
      if (opts.defaultTab) {
        let byLink = tabLinks.find(l => l.getAttribute('data-tab-link') === opts.defaultTab);
        if (byLink) return byLink;

        let byPanel = tabLinks.find((l) => {
          const id = l.getAttribute('data-tab-link');
          const p = tabMap[id] && tabMap[id].content;
          return p && (p.id === opts.defaultTab || p.getAttribute('data-tab-content') === opts.defaultTab);
        });
        if (byPanel) return byPanel;
      }

      const preActive = tabLinks.find(l =>
        l.classList.contains('is-active') ||
        l.getAttribute('aria-selected') === 'true' ||
        l.classList.contains('is-open') ||
        l.getAttribute('aria-expanded') === 'true'
      );
      if (preActive) return preActive;

      return tabLinks[0] || null;
    }

    return api;
  }

  function readContainerOptions(container) {
    return {
      mode: container.getAttribute('data-tabs-mode') || 'click',
      defaultTab: container.getAttribute('data-tabs-default') || null,
      autoplayDelay: parseInt(container.getAttribute('data-tabs-autoplay'), 10) || 0,
      transitionDuration: parseInt(container.getAttribute('data-tabs-transition-duration'), 10) || 300,
      crossfade: container.getAttribute('data-tabs-crossfade') === 'true',
      accordionMultiple: container.getAttribute('data-tabs-accordion-multiple') === 'true',
      accordionDuration: parseInt(container.getAttribute('data-tabs-accordion-duration'), 10) || 300
    };
  }
})();
