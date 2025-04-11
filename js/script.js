(function() {
  const tabContainers = document.querySelectorAll('[data-tabs]');

  tabContainers.forEach(container => initTabs(container));

  function initTabs(container) {
    // Get all tab links and contents in their DOM order
    let tabLinks = Array.from(container.querySelectorAll('[data-tab-link]'));
    let contents = Array.from(container.querySelectorAll('[data-tab-content]'));

    const mode = container.getAttribute('data-tabs-mode') || 'click';
    const defaultTab = container.getAttribute('data-tabs-default');
    const autoplayDelay = parseInt(container.getAttribute('data-tabs-autoplay'), 10);
    const transitionDuration = parseInt(container.getAttribute('data-tabs-transition-duration'), 10) || 300;

    // 1) Auto-assign IDs to links if missing
    tabLinks.forEach((link, i) => {
      if (!link.hasAttribute('data-tab-link')) {
        link.setAttribute('data-tab-link', `auto-tab-${i}`);
      }
    });

    // 2) Auto-assign IDs to contents if missing
    contents.forEach((content, i) => {
      if (!content.hasAttribute('data-tab-content')) {
        content.setAttribute('data-tab-content', `auto-tab-${i}`);
      }
    });

    // Now that all items have data-tab-* attributes, re-read in case we changed them
    tabLinks = Array.from(container.querySelectorAll('[data-tab-link]'));
    contents = Array.from(container.querySelectorAll('[data-tab-content]'));

    // Store references for quick lookup by ID
    const tabMap = {};
    contents.forEach(content => {
      const targetId = content.getAttribute('data-tab-content');
      tabMap[targetId] = { content };

      // Setup ARIA
      content.setAttribute('role', 'tabpanel');
      content.setAttribute('aria-hidden', 'true');
      content.style.display = 'none';
    });

    tabLinks.forEach(link => {
      const targetId = link.getAttribute('data-tab-link');
      let linkId = link.id || targetId + '-tab';
      link.id = linkId;

      // ARIA setup for link
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

      // Interaction mode
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
      const initialId = initialLink.getAttribute('data-tab-link');
      const c = tabMap[initialId].content;
      showContent(c);
      markLinkActive(initialLink, tabLinks);
    }

    // Autoplay
    if (!isNaN(autoplayDelay) && autoplayDelay > 0) {
      startAutoplay(container, tabLinks, tabMap, transitionDuration, autoplayDelay);
    }
  }

  function activateTab(container, link, tabLinks, tabMap, transitionDuration) {
    const targetId = link.getAttribute('data-tab-link');
    const targetData = tabMap[targetId];
    if (!targetData) return;

    // If already active, do nothing
    if (link.classList.contains('is-active')) return;

    // Find currently active content
    const currentLink = tabLinks.find(l => l.classList.contains('is-active'));
    let currentContent = null;
    if (currentLink) {
      const currentId = currentLink.getAttribute('data-tab-link');
      currentContent = tabMap[currentId].content;
    }

    const nextContent = targetData.content;

    // Switch content
    switchContent(currentContent, nextContent, () => {
      // After content is switched, update link states
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
      // Same content, just callback
      if (callback) callback();
      return;
    }

    // If no current content, just show next
    if (!currentContent) {
      showContent(nextContent);
      if (callback) callback();
      return;
    }

    // Fade out current first, then fade in next
    hideContent(currentContent, () => {
      showContent(nextContent);
      if (callback) callback();
    }, duration);
  }

  function showContent(content) {
    content.style.display = 'block';
    requestAnimationFrame(() => {
      content.classList.add('is-active');
      content.setAttribute('aria-hidden', 'false');

      // Play video if any
      const video = content.querySelector('video');
      if (video) video.play().catch(() => {});
    });
  }

  function hideContent(content, callback, duration) {
    content.classList.remove('is-active');
    content.setAttribute('aria-hidden', 'true');

    // Pause video if any
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

    // Fallback timeout if no transition occurs
    setTimeout(finalizeHide, duration);
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