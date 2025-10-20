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
      crossfade: false
    };
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
        showContent(c);
        markLinkActive(initialLink, tabLinks);
        state.activeLink = initialLink;
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
      crossfade: false
    };
    container._tabState = state;

    const targetId = link.getAttribute('data-tab-link');
    const targetData = tabMap[targetId];
    if (!targetData) return;

    // Skip if already active
    if (state.activeLink === link) return;

    // Find the currently active tab
    const currentLink = state.activeLink;
    let currentContent = null;
    if (currentLink) {
      const currentId = currentLink.getAttribute('data-tab-link');
      currentContent = tabMap[currentId]?.content;
    }
    const nextContent = targetData.content;

    const token = Symbol('tabTransition');
    state.transitionToken = token;

    // Switch content with fade effect
    switchContent(currentContent, nextContent, () => {
      if (state.transitionToken !== token) return;
      markLinkActive(link, tabLinks);
      state.activeLink = link;
    }, transitionDuration, { crossfade: state.crossfade, state, token });
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

  function switchContent(currentContent, nextContent, callback, duration, options = {}) {
    const { crossfade = false, state = null, token = null } = options;
    if (currentContent === nextContent) {
      if (callback) callback();
      return;
    }
    if (!currentContent) {
      if (state && token && state.transitionToken !== token) return;
      showContent(nextContent);
      if (callback) callback();
      return;
    }
    cancelHide(currentContent);
    if (state && token && state.transitionToken !== token) return;
    if (crossfade) {
      showContent(nextContent);
      hideContent(currentContent, () => {
        if (state && token && state.transitionToken !== token) return;
        if (callback) callback();
      }, duration);
      return;
    }
    hideContent(currentContent, () => {
      if (state && token && state.transitionToken !== token) return;
      showContent(nextContent);
      if (callback) callback();
    }, duration);
  }

  // Updated showContent: after displaying content, check for swipers within it.
  function showContent(content) {
    cancelHide(content);
    content.style.display = 'block';
    requestAnimationFrame(() => {
      content.classList.add('is-active');
      content.setAttribute('aria-hidden', 'false');
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

  function hideContent(content, callback, duration) {
    content.classList.remove('is-active');
    content.setAttribute('aria-hidden', 'true');

    // Pause video if any exists
    const video = content.querySelector('video');
    if (video) video.pause();

    let finished = false;

    const finalizeHide = () => {
      if (!finished) {
        finished = true;
        content.style.display = 'none';
        if (callback) callback();
      }
    };

    if (content._tabHideCleanup) {
      const { handler, timer } = content._tabHideCleanup;
      if (handler) content.removeEventListener('transitionend', handler);
      if (timer) clearTimeout(timer);
    }

    let timeoutId;

    const handler = (e) => {
      if (e.propertyName !== 'opacity') return;
      content.removeEventListener('transitionend', handler);
      clearTimeout(timeoutId);
      finalizeHide();
      content._tabHideCleanup = null;
    };

    content.addEventListener('transitionend', handler);
    timeoutId = setTimeout(() => {
      content.removeEventListener('transitionend', handler);
      finalizeHide();
      content._tabHideCleanup = null;
    }, duration);

    content._tabHideCleanup = { handler, timer: timeoutId };
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