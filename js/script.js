(function () {
  const tabContainers = document.querySelectorAll('[data-tabs]');

  tabContainers.forEach((container) => initTabs(container));

  function initTabs(container) {
    // Config
    const mode = container.getAttribute('data-tabs-mode') || 'click';
    const defaultTab = container.getAttribute('data-tabs-default');
    const autoplayDelay = parseInt(container.getAttribute('data-tabs-autoplay'), 10);
    const transitionDuration =
      parseInt(container.getAttribute('data-tabs-transition-duration'), 10) || 300;
    const crossfade = container.getAttribute('data-tabs-crossfade') === 'true';

    // Read links/contents
    let tabLinks = Array.from(container.querySelectorAll('[data-tab-link]'));
    let contents = Array.from(container.querySelectorAll('[data-tab-content]'));

    // Auto-assign empty/missing identifiers in DOM order
    tabLinks.forEach((link, i) => {
      let id = link.getAttribute('data-tab-link');
      if (!id || id.trim() === '') {
        id = `auto-tab-${i}`;
        link.setAttribute('data-tab-link', id);
      }
    });
    contents.forEach((panel, i) => {
      let id = panel.getAttribute('data-tab-content');
      if (!id || id.trim() === '') {
        id = `auto-tab-${i}`;
        panel.setAttribute('data-tab-content', id);
      }
    });

    // Re-fetch after potential changes
    tabLinks = Array.from(container.querySelectorAll('[data-tab-link]'));
    contents = Array.from(container.querySelectorAll('[data-tab-content]'));

    // Optional: create a wrapper for crossfade so panels can overlay without stacking layout
    let panelsWrapper = null;
    if (crossfade) {
      panelsWrapper = container.querySelector('[data-tabs-panels]');
      if (!panelsWrapper) {
        panelsWrapper = document.createElement('div');
        panelsWrapper.setAttribute('data-tabs-panels', '');
        // Insert wrapper right before the first panel and move all panels inside
        const firstPanel = contents[0];
        if (firstPanel) {
          firstPanel.parentNode.insertBefore(panelsWrapper, firstPanel);
          contents.forEach((p) => panelsWrapper.appendChild(p));
        }
      }
      panelsWrapper.style.position = 'relative';
      container._panelsWrapper = panelsWrapper;
    }

    // Build map and set ARIA
    const tabMap = {};
    contents.forEach((panel) => {
      const id = panel.getAttribute('data-tab-content');
      tabMap[id] = { content: panel };
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-hidden', 'true');
      panel.style.display = 'none';
    });

    // Link setup
    tabLinks.forEach((link) => {
      const targetId = link.getAttribute('data-tab-link');
      link.id = link.id || targetId + '-tab';

      link.setAttribute('role', 'tab');
      link.setAttribute('aria-selected', 'false');
      link.setAttribute('aria-expanded', 'false');
      link.setAttribute('tabindex', '0');

      const panel = tabMap[targetId] && tabMap[targetId].content;
      if (panel) {
        if (!panel.id) panel.id = targetId + '-content';
        panel.setAttribute('aria-labelledby', link.id);
        link.setAttribute('aria-controls', panel.id);
      }

      // Keyboard
      link.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activateTab(container, link, tabLinks, tabMap, transitionDuration, { crossfade, mode });
        }
      });

      // Interaction
      if (mode === 'click') {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          activateTab(container, link, tabLinks, tabMap, transitionDuration, { crossfade, mode });
        });
      } else if (mode === 'hover') {
        link.addEventListener('mouseenter', () => {
          // Schedule on next frame to coalesce extremely fast hovers
          if (container._hoverRaf) cancelAnimationFrame(container._hoverRaf);
          container._hoverRaf = requestAnimationFrame(() => {
            activateTab(container, link, tabLinks, tabMap, transitionDuration, { crossfade, mode });
          });
        });
      }
    });

    container.setAttribute('role', 'tablist');

    // Initial
    let initialLink = defaultTab
      ? tabLinks.find((l) => l.getAttribute('data-tab-link') === defaultTab)
      : tabLinks[0];

    if (initialLink) {
      const initialId = initialLink.getAttribute('data-tab-link');
      const c = tabMap[initialId] && tabMap[initialId].content;
      if (c) {
        showContent(container, c, { crossfade, instant: true });
        markLinkActive(initialLink, tabLinks);
      }
    }

    // Autoplay
    if (!isNaN(autoplayDelay) && autoplayDelay > 0) {
      startAutoplay(container, tabLinks, tabMap, transitionDuration, autoplayDelay, { crossfade, mode });
    }
  }

  function activateTab(container, link, tabLinks, tabMap, duration, opts) {
    const { crossfade, mode } = opts;
    const targetId = link.getAttribute('data-tab-link');
    const targetData = tabMap[targetId];
    if (!targetData) return;

    if (link.classList.contains('is-active')) return;

    const currentLink = tabLinks.find((l) => l.classList.contains('is-active'));
    let currentContent = null;
    if (currentLink) {
      const currentId = currentLink.getAttribute('data-tab-link');
      currentContent = tabMap[currentId] && tabMap[currentId].content;
    }

    const nextContent = targetData.content;

    // Increment switch token so only the last switch can finalize async work
    container._switchToken = (container._switchToken || 0) + 1;
    const token = container._switchToken;

    if (mode === 'hover' && !crossfade) {
      // HOVER FIX: force-hide previous immediately, then show next
      if (currentContent) forceHide(currentContent);
      showContent(container, nextContent, { crossfade: false, instant: true });
      markLinkActive(link, tabLinks);
      return;
    }

    if (crossfade && currentContent && nextContent) {
      crossfadeSwitch(container, currentContent, nextContent, duration, () => {
        if (token === container._switchToken) markLinkActive(link, tabLinks);
      });
    } else {
      // Original fade-out then fade-in (click mode)
      switchContent(container, currentContent, nextContent, () => {
        if (token === container._switchToken) markLinkActive(link, tabLinks);
      }, duration);
    }
  }

  function markLinkActive(link, tabLinks) {
    tabLinks.forEach((l) => {
      l.classList.remove('is-active');
      l.setAttribute('aria-selected', 'false');
      l.setAttribute('aria-expanded', 'false');
    });
    link.classList.add('is-active');
    link.setAttribute('aria-selected', 'true');
    link.setAttribute('aria-expanded', 'true');
  }

  // Default (click mode) sequential switch
  function switchContent(container, currentContent, nextContent, callback, duration) {
    if (currentContent === nextContent) {
      if (callback) callback();
      return;
    }
    if (!currentContent) {
      showContent(container, nextContent, { crossfade: false });
      if (callback) callback();
      return;
    }
    hideContent(currentContent, () => {
      showContent(container, nextContent, { crossfade: false });
      if (callback) callback();
    }, duration);
  }

  // Crossfade: overlay panels inside a temporary relative wrapper
  function crossfadeSwitch(container, current, next, duration, done) {
    const wrapper = container._panelsWrapper || current.parentElement;

    // Ensure both are visible and stacked without affecting layout
    prepareAsOverlay(current);
    prepareAsOverlay(next);

    // Measure and lock wrapper height to avoid jumps
    const targetH = Math.max(current.offsetHeight, next.offsetHeight);
    if (wrapper) wrapper.style.height = targetH + 'px';

    // Show next first (opacity in via .is-active), then fade out current
    showContent(container, next, { crossfade: true });
    // Start fade-out of current
    current.classList.remove('is-active');
    current.setAttribute('aria-hidden', 'true');

    // When current finishes opacity transition (or after fallback), finalize
    const finalize = () => {
      forceHide(current);
      cleanupOverlay(next);
      if (wrapper) wrapper.style.height = ''; // let it auto-size to next
      if (typeof done === 'function') done();
    };

    const onEnd = (e) => {
      if (e.propertyName !== 'opacity') return;
      current.removeEventListener('transitionend', onEnd);
      finalize();
    };
    current.addEventListener('transitionend', onEnd);
    // Fallback
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
    el.style.pointerEvents = 'none'; // avoid accidental interactions during crossfade
  }

  function cleanupOverlay(el) {
    el.style.position = '';
    el.style.left = '';
    el.style.top = '';
    el.style.width = '';
    el.style.pointerEvents = '';
  }

  function showContent(container, content, opts = {}) {
    const { instant = false, crossfade = false } = opts;
    content.style.display = 'block';
    requestAnimationFrame(() => {
      content.classList.add('is-active');
      content.setAttribute('aria-hidden', 'false');
      if (!crossfade) {
        // normal interactive state
        content.style.pointerEvents = '';
      }
      // Swiper refresh for any nested sliders
      loadSwipersInContent(content);

      // Auto-play video if any
      const video = content.querySelector('video');
      if (video) {
        video.play().catch(() => {});
      }
    });
  }

  function hideContent(content, callback, duration) {
    if (!content) {
      if (callback) callback();
      return;
    }

    // Clear any previous listeners/fallbacks to avoid double-calls
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

    const finalizeHide = () => {
      content.style.display = 'none';
      if (callback) callback();
    };

    const onEnd = (e) => {
      if (e.propertyName !== 'opacity') return;
      content.removeEventListener('transitionend', onEnd);
      content._onTransitionEnd = null;
      finalizeHide();
    };
    content._onTransitionEnd = onEnd;
    content.addEventListener('transitionend', onEnd);

    // Fallback in case no transition fires
    content._hideFallback = setTimeout(() => {
      content.removeEventListener('transitionend', onEnd);
      content._onTransitionEnd = null;
      finalizeHide();
    }, duration);
  }

  // Immediate hide used by hover bug fix
  function forceHide(content) {
    if (!content) return;
    // Cancel pending listeners/timeouts
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
    // Clean any overlay styles if they were set
    content.style.position = '';
    content.style.left = '';
    content.style.top = '';
    content.style.width = '';
    content.style.pointerEvents = '';
  }

  function loadSwipersInContent(content) {
    const swiperContainers = content.querySelectorAll('.slider-main_component');
    swiperContainers.forEach((el) => {
      if (el._swiperInstance && typeof el._swiperInstance.update === 'function') {
        el._swiperInstance.update();
      }
    });
  }

  function startAutoplay(container, tabLinks, tabMap, duration, delay, opts) {
    const { crossfade, mode } = opts;
    let currentIndex = tabLinks.findIndex((l) => l.classList.contains('is-active'));
    if (currentIndex === -1) currentIndex = 0;

    setInterval(() => {
      currentIndex = (currentIndex + 1) % tabLinks.length;
      activateTab(container, tabLinks[currentIndex], tabLinks, tabMap, duration, { crossfade, mode });
    }, delay);
  }
})();
