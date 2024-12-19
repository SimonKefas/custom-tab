# Accessible Tab/Accordion System with Attribute Configuration, Transitions, and Autoplay

This solution provides a flexible, accessible, and performant tabs/accordion system that can be driven entirely by HTML attributes. It supports:

- Multiple tab sets on the same page
- Click or hover interaction modes
- Accessible ARIA attributes
- Autoplaying between tabs at a defined interval
- Smooth transitions using CSS for opacity and layout control
- Integration with embedded videos (plays when active, pauses when hidden)
- Configurable transition durations to gracefully handle fade-in/out animations

## Features

- **Attribute-Driven**: No need to modify JavaScript. Configure behavior using HTML attributes.
- **Multiple Instances**: Supports multiple `[data-tabs]` containers on the same page.
- **Accessibility**: Proper `role`, `aria-selected`, `aria-controls`, and `aria-hidden` attributes for screen readers.
- **Performance**: Minimizes unnecessary DOM manipulation, waits for transitions, and uses fallback timers.
- **Animations**: The code manages `display` and `is-active` classes so you can focus on CSS transitions (e.g., fading) without seeing multiple contents at once.

## Getting Started

### HTML Structure

Wrap your tabs in a container with `[data-tabs]`. Inside, create tab triggers with `[data-tab-link="identifier"]` and corresponding contents with `[data-tab-content="identifier"]`.

**Example:**
```html
<div data-tabs 
     data-tabs-mode="click" 
     data-tabs-default="tab-1" 
     data-tabs-transition-duration="300"
     data-tabs-autoplay="5000">
  
  <!-- Tab Links -->
  <button data-tab-link="tab-1" class="tab-link">Tab One</button>
  <button data-tab-link="tab-2" class="tab-link">Tab Two</button>
  <button data-tab-link="tab-3" class="tab-link">Tab Three</button>

  <!-- Tab Contents -->
  <div data-tab-content="tab-1" class="tab-content">
    <p>Content for Tab One</p>
    <video src="video1.mp4" muted playsinline></video>
  </div>
  
  <div data-tab-content="tab-2" class="tab-content">
    <p>Content for Tab Two</p>
  </div>

  <div data-tab-content="tab-3" class="tab-content">
    <p>Content for Tab Three</p>
  </div>
</div>
```

### Attributes

- **`data-tabs`**:  
  Defines a container as a tab component.
  
- **`data-tabs-mode="click|hover"`** *(optional)*:  
  Defines the interaction mode. Default is `click`.
  
- **`data-tabs-default="[identifier]"`** *(optional)*:  
  Specifies which tab should be active by default. If not provided, the first tab link found is opened.
  
- **`data-tabs-autoplay="[milliseconds]"`** *(optional)*:  
  When provided, the tabs will automatically cycle through at the specified interval.
  
- **`data-tabs-transition-duration="[milliseconds]"`** *(optional)*:  
  Sets a fallback duration for the transition. If no `transitionend` event is received, the script will assume the transition ended after this duration.
  
- **`data-tab-link="[identifier]"`**:  
  Placed on a tab trigger element (button, link, etc.). The `identifier` must match a `data-tab-content`.
  
- **`data-tab-content="[identifier]"`**:  
  Placed on a content panel. Must match a `data-tab-link`.

### CSS Setup

Use CSS transitions for `.tab-content`. The script toggles `display` and `.is-active` for you, so you can focus on transitions like opacity:

```css
.tab-content {
  opacity: 0;
  transition: opacity 0.3s ease;
  display: none; /* Hidden by default */
}

.tab-content.is-active {
  opacity: 1;
  display: block; /* Shown only when active */
}
```

You can adjust the transition (time, easing) as desired. The JavaScript ensures that old content fades out fully (and is set to `display: none`) before the new content fades in, preventing overlapping content or layout shifts.

### JavaScript

Simply include the provided JavaScript code in your page (e.g., at the bottom of the body or via a separate JS file). It will automatically initialize any `[data-tabs]` components found in the DOM.

**No additional initialization code is needed**—it runs on `DOMContentLoaded` if placed after the HTML, or after the script is executed.

### Videos

If a `video` element is inside a tab content, it will:
- **Play** automatically when the tab is shown (if `play()` is allowed by the browser).
- **Pause** automatically when the tab is hidden.

### Autoplay

If `data-tabs-autoplay` is set, the tabs will rotate through each tab link in order after the specified interval. When it reaches the last tab, it loops back to the first. If you want to stop this behavior, simply remove the `data-tabs-autoplay` attribute.

### Performance Considerations

- All selectors are cached and references stored where possible.
- The script waits for transitions to complete (or falls back to a timeout) before updating the DOM again, minimizing layout thrashing.
- Only the necessary attributes and classes are updated at runtime.

### Browser Support

- Modern browsers should be supported.  
- For older browsers that do not support `requestAnimationFrame` or CSS transitions, you can include polyfills or adjust the logic as needed.

### Advanced Customization

- **Different Animations**:  
  Replace the CSS transitions with GSAP or another animation library. Just ensure `.is-active` and `display` handling remains.
  
- **Accordion Behavior**:  
  Alter logic (e.g., removing the "close others" step) to allow multiple open panels at once, if desired.

- **Pausing Autoplay on Interaction**:  
  Extend the code to clear the interval when a user interacts with the tabs if you don’t want the carousel-like behavior.