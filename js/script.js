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
      }
    }

    // Set up autoplay if configured
    if (!isNaN(autoplayDelay) && autoplayDelay > 0) {
      startAutoplay(container, tabLinks, tabMap, transitionDuration, autoplayDelay);
    }
  }

  function activateTab(container, link, tabLinks, tabMap, transitionDuration) {
    const targetId = link.getAttribute('data-tab-link');
    const targetData = tabMap[targetId];
    if (!targetData) return;

    // Skip if already active
    if (link.classList.contains('is-active')) return;

    // Find the currently active tab
    const currentLink = tabLinks.find(l => l.classList.contains('is-active'));
    let currentContent = null;
    if (currentLink) {
      const currentId = currentLink.getAttribute('data-tab-link');
      currentContent = tabMap[currentId]?.content;
    }
    const nextContent = targetData.content;

    // Switch content with fade effect
    switchContent(currentContent, nextContent, () => {
      markLinkActive(link, tabLinks);
    }, transitionDuration);
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

  function switchContent(currentContent, nextContent, callback, duration) {
    if (currentContent === nextContent) {
      if (callback) callback();
      return;
    }
    if (!currentContent) {
      showContent(nextContent);
      if (callback) callback();
      return;
    }
    hideContent(currentContent, () => {
      showContent(nextContent);
      if (callback) callback();
    }, duration);
  }

  // Updated showContent: after displaying content, check for swipers within it.
  function showContent(content) {
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

  function hideContent(content, callback, duration) {
    content.classList.remove('is-active');
    content.setAttribute('aria-hidden', 'true');

    // Pause video if any exists
    const video = content.querySelector('video');
    if (video) video.pause();

    let finished = false;

    const onTransitionEnd = (e) => {
      if (e.propertyName !== 'opacity') return;
      content.removeEventListener('transitionend', onTransitionEnd);
      finalizeHide();
    };

    const finalizeHide = () => {
      if (!finished) {
        finished = true;
        content.style.display = 'none';
        if (callback) callback();
      }
    };

    content.addEventListener('transitionend', onTransitionEnd);
    setTimeout(finalizeHide, duration);
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

    setInterval(() => {
      currentIndex = (currentIndex + 1) % tabLinks.length;
      activateTab(container, tabLinks[currentIndex], tabLinks, tabMap, transitionDuration);
    }, delay);
  }
})();