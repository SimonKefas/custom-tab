(function() {
  const tabContainers = document.querySelectorAll('[data-tabs]');

  tabContainers.forEach(container => initTabs(container));

  function initTabs(container) {
    // Get tab links and tab contents in DOM order
    let tabLinks = Array.from(container.querySelectorAll('[data-tab-link]'));
    let contents = Array.from(container.querySelectorAll('[data-tab-content]'));
    const mode = container.getAttribute('data-tabs-mode') || 'click';
    const defaultTab = container.getAttribute('data-tabs-default');
    const autoplayDelay = parseInt(container.getAttribute('data-tabs-autoplay'), 10);
    const transitionDuration = parseInt(container.getAttribute('data-tabs-transition-duration'), 10) || 300;

    const state = container._tabState || {
      activeLink: null,
      transitionToken: null,
      crossfade: false,
      transition: null,
      visibleContent: null
    };
    if (typeof state.transition === 'undefined') state.transition = null;
    if (typeof state.visibleContent === 'undefined') state.visibleContent = null;
    container._tabState = state;

    // Auto-assign an identifier if data-tab-link attribute is missing/empty
    tabLinks.forEach((link, i) => {
      let identifier = link.getAttribute('data-tab-link');
      if (!identifier || identifier.trim() === "") {
        identifier = `auto-tab-${i}`;
        link.setAttribute('data-tab-link', identifier);
      }
    });

    // Auto-assign an identifier if data-tab-content attribute is missing/empty
    contents.forEach((content, i) => {
      let identifier = content.getAttribute('data-tab-content');
      if (!identifier || identifier.trim() === "") {
        identifier = `auto-tab-${i}`;
        content.setAttribute('data-tab-content', identifier);
      }
    });

    // Re-read links and contents after auto-assignment
    tabLinks = Array.from(container.querySelectorAll('[data-tab-link]'));
    contents = Array.from(container.querySelectorAll('[data-tab-content]'));

    // Create a lookup map for the contents by identifier
    const tabMap = {};
    contents.forEach(content => {
      const targetId = content.getAttribute('data-tab-content');
      tabMap[targetId] = { content };
      content.setAttribute('role', 'tabpanel');
      content.setAttribute('aria-hidden', 'true');
      content.style.display = 'none';
    });

    // Set up each tab link
    tabLinks.forEach(link => {
      const targetId = link.getAttribute('data-tab-link');
      let linkId = link.id || targetId + '-tab';
      link.id = linkId;

      // ARIA setup for accessibility
      link.setAttribute('role', 'tab');
      link.setAttribute('aria-selected', 'false');
      link.setAttribute('aria-expanded', 'false');
      link.setAttribute('tabindex', '0');

      // Link to content via aria-controls
      const contentObj = tabMap[targetId]?.content;
      if (contentObj) {
        if (!contentObj.id) contentObj.id = targetId + '-content';
        contentObj.setAttribute('aria-labelledby', link.id);
        link.setAttribute('aria-controls', contentObj.id);
      }

      // Keyboard navigation
      link.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activateTab(container, link, tabLinks, tabMap, transitionDuration);
        }
      });

      // Interaction mode (click or hover)
      if (mode === 'click') {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          activateTab(container, link, tabLinks, tabMap, transitionDuration);
        });
      } else if (mode === 'hover') {
        link.addEventListener('mouseenter', () => {
          activateTab(container, link, tabLinks, tabMap, transitionDuration);
        });
      }
    });

    container.setAttribute('role', 'tablist');

    const transitionSetting = (container.getAttribute('data-tabs-transition') || '').toLowerCase();
    const crossfade = transitionSetting === 'crossfade' || container.hasAttribute('data-tabs-crossfade');
    state.crossfade = crossfade;
    if (crossfade) {
      container.classList.add('has-crossfade-tabs');
    } else {
      container.classList.remove('has-crossfade-tabs');
    }

    // Determine initial tab to open
    let initialLink = defaultTab
      ? tabLinks.find(l => l.getAttribute('data-tab-link') === defaultTab)
      : tabLinks[0];

    if (initialLink) {
      const targetId = initialLink.getAttribute('data-tab-link');
      const c = tabMap[targetId]?.content;
      if (c) {
        showContent(c, { state });
        markLinkActive(initialLink, tabLinks);
        state.activeLink = initialLink;
        state.visibleContent = c;
      }
    }

    // Set up autoplay if configured
    if (!isNaN(autoplayDelay) && autoplayDelay > 0) {
      startAutoplay(container, tabLinks, tabMap, transitionDuration, autoplayDelay);
    }
  }

  function activateTab(container, link, tabLinks, tabMap, transitionDuration) {
    const state = container._tabState || {
      activeLink: null,
      transitionToken: null,
      crossfade: false,
      transition: null,
      visibleContent: null
    };
    if (typeof state.transition === 'undefined') state.transition = null;
    if (typeof state.visibleContent === 'undefined') state.visibleContent = null;

    container._tabState = state;

    const targetId = link.getAttribute('data-tab-link');
    const targetData = tabMap[targetId];
    if (!targetData) return;

    const nextContent = targetData.content;

    if (state.activeLink === link && state.visibleContent === nextContent) {
      return;
    }

    if (state.transition && typeof state.transition.finish === 'function') {
      state.transition.finish({ skipCallback: true });
    }
    state.transition = null;

    const token = Symbol('tabTransition');
    state.transitionToken = token;
    state.activeLink = link;
    markLinkActive(link, tabLinks);

    if (!nextContent) return;

    const outgoingContent = state.visibleContent && state.visibleContent !== nextContent
      ? state.visibleContent
      : null;

    if (!outgoingContent) {
      showContent(nextContent, { state, token });
      return;
    }

    if (state.crossfade) {
      showContent(nextContent, { state, token });
    }

    hideContent(outgoingContent, () => {
      if (!state.crossfade) {
        showContent(nextContent, { state, token });
      }
      state.transition = null;
    }, transitionDuration, { state, token });

    state.transition = {
      from: outgoingContent,
      to: nextContent,
      token,
      finish(options = {}) {
        const skipCallback = options.skipCallback === true;
        forceFinishHide(outgoingContent, { skipCallback });
        state.transition = null;
      }
    };
  }

  function markLinkActive(link, tabLinks) {
    tabLinks.forEach(l => {
      l.classList.remove('is-active');
      l.setAttribute('aria-selected', 'false');
      l.setAttribute('aria-expanded', 'false');
    });
    link.classList.add('is-active');
    link.setAttribute('aria-selected', 'true');
    link.setAttribute('aria-expanded', 'true');
  }

  // Updated showContent: after displaying content, check for swipers within it.
  function showContent(content, options = {}) {
    const { state = null, token = null } = options;
    cancelHide(content);
    content.style.display = 'block';
    requestAnimationFrame(() => {
      if (state && token && state.transitionToken !== token) {
        content.style.display = 'none';
        if (state.visibleContent === content) {
          state.visibleContent = null;
        }
        return;
      }
      content.classList.add('is-active');
      content.setAttribute('aria-hidden', 'false');
      if (state) {
        state.visibleContent = content;
      }
      // Check for swiper containers within the active tab content and refresh them.
      loadSwipersInContent(content);
      // If video is present, attempt to play it.
      const video = content.querySelector('video');
      if (video) video.play().catch(() => {});
    });
  }

  function cancelHide(content) {
    if (!content || !content._tabHideCleanup) return;
    const { handler, timer } = content._tabHideCleanup;
    if (handler) content.removeEventListener('transitionend', handler);
    if (timer) clearTimeout(timer);
    content._tabHideCleanup = null;
  }

  function forceFinishHide(content, options = {}) {
    if (!content || !content._tabHideCleanup) return;
    const { handler, timer, finalize } = content._tabHideCleanup;
    if (handler) content.removeEventListener('transitionend', handler);
    if (timer) clearTimeout(timer);
    if (typeof finalize === 'function') {
      finalize(options);
    } else {
      content._tabHideCleanup = null;
    }
  }

  function hideContent(content, callback, duration, options = {}) {
    const { state = null, token = null } = options;
    content.classList.remove('is-active');
    content.setAttribute('aria-hidden', 'true');

    // Pause video if any exists
    const video = content.querySelector('video');
    if (video) video.pause();

    let finished = false;


    if (content._tabHideCleanup) {
      const { handler: existingHandler, timer: existingTimer } = content._tabHideCleanup;
      if (existingHandler) content.removeEventListener('transitionend', existingHandler);
      if (existingTimer) clearTimeout(existingTimer);
    }

    const finalizeHide = (opts = {}) => {
      if (finished) return;
      finished = true;
      const skipCallback = opts.skipCallback === true;
      content.style.display = 'none';
      if (state && state.visibleContent === content) {
        state.visibleContent = null;
      }
      content._tabHideCleanup = null;
      if (skipCallback) return;
      if (state && token && state.transitionToken !== token) return;
      if (callback) callback();
    };

    let timeoutId;

    const handler = (e) => {
      if (e.propertyName !== 'opacity') return;
      content.removeEventListener('transitionend', handler);
      clearTimeout(timeoutId);
      finalizeHide();
    };

    content.addEventListener('transitionend', handler);
    timeoutId = setTimeout(() => {
      content.removeEventListener('transitionend', handler);
      finalizeHide();
    }, duration);

    content._tabHideCleanup = { handler, timer: timeoutId, finalize: finalizeHide };
  }

  // New helper: Check for swiper containers in the tab content and update them.
  function loadSwipersInContent(content) {
    const swiperContainers = content.querySelectorAll('.slider-main_component');
    swiperContainers.forEach(function(container) {
      if (container._swiperInstance && typeof container._swiperInstance.update === 'function') {
        container._swiperInstance.update();
      }
    });
  }

  function startAutoplay(container, tabLinks, tabMap, transitionDuration, delay) {
    let currentIndex = tabLinks.findIndex(l => l.classList.contains('is-active'));
    if (currentIndex === -1) currentIndex = 0;
    const state = container._tabState;

    setInterval(() => {
      if (state && state.activeLink) {
        const activeIndex = tabLinks.indexOf(state.activeLink);
        if (activeIndex !== -1) {
          currentIndex = activeIndex;
        }
      }
      currentIndex = (currentIndex + 1) % tabLinks.length;
      activateTab(container, tabLinks[currentIndex], tabLinks, tabMap, transitionDuration);
    }, delay);
  }
})();