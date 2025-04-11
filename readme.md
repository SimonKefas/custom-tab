# Accessible Tab/Accordion System with Attribute Configuration, Transitions, and Autoplay

This solution provides a flexible, accessible, and performant tabs/accordion system that can be driven entirely by HTML attributes. It supports:

- Multiple tab sets on the same page
- Click or hover interaction modes
- Accessible ARIA attributes
- Autoplaying between tabs at a defined interval
- Smooth transitions using CSS for opacity and layout control
- Integration with embedded videos (plays when active, pauses when hidden)
- Configurable transition durations to gracefully handle fade-in/out animations
- **Automatic Attribute Assignment**: When using Collection Lists that do not have explicit `data-tab-link` or `data-tab-content` attributes, the script auto-assigns these based on DOM order.

## Script Code

Include the following script tag in your HTML (e.g., at the bottom of your `<body>`) to load the custom tab solution:

```html
<script src="https://cdn.jsdelivr.net/gh/SimonKefas/custom-tab@latest/js/script.js"></script>
```

## Features

- **Attribute-Driven**: No need to modify JavaScript. Configure behavior using HTML attributes.
- **Multiple Instances**: Supports multiple `[data-tabs]` containers on the same page.
- **Accessibility**: Proper `role`, `aria-selected`, `aria-controls`, and `aria-hidden` attributes for screen readers.
- **Performance**: Minimizes unnecessary DOM manipulation, waits for transitions, and uses fallback timers.
- **Animations**: The code manages `display` and `.is-active` classes so you can focus on CSS transitions (e.g., fading) without showing multiple contents at once.
- **Automatic Matching for Collection Lists**: If no `data-tab-link` or `data-tab-content` attributes are specified, the script assigns them automatically in the order of appearance (e.g., `auto-tab-0`, `auto-tab-1`, etc.).

## Getting Started

### HTML Structure

Wrap your tabs in a container with the `[data-tabs]` attribute. Inside, create tab triggers with `[data-tab-link="identifier"]` and corresponding content panels with `[data-tab-content="identifier"]`.

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

_Note:_ When using Collection Lists in Webflow, if you leave out the explicit `data-tab-link` or `data-tab-content` values, the script auto-assigns them based on the order of elements in the DOM.

### Attributes

- **`data-tabs`**:  
  Marks the container as a tab component.
  
- **`data-tabs-mode="click|hover"`** *(optional)*:  
  Defines the user interaction mode (default is `click`).
  
- **`data-tabs-default="[identifier]"`** *(optional)*:  
  Specifies the tab to be active by default. If not provided, the first tab link is activated.
  
- **`data-tabs-autoplay="[milliseconds]"`** *(optional)*:  
  Sets an interval for auto-cycling through tabs.
  
- **`data-tabs-transition-duration="[milliseconds]"`** *(optional)*:  
  Sets a fallback duration for CSS transitions if the `transitionend` event is not detected.
  
- **`data-tab-link="[identifier]"`**:  
  Applied on a tab trigger element (button, link, etc.). This identifier should match with the corresponding `data-tab-content` value. If missing, the script assigns an auto-generated ID (e.g., `auto-tab-0`).
  
- **`data-tab-content="[identifier]"`**:  
  Applied on the content panel that corresponds to a tab link. Must match a `data-tab-link` value or will be auto-assigned in sequence.

### CSS Setup

Apply your CSS transitions on `.tab-content`. The script toggles `display` and the `.is-active` class so you can focus on transitions (like opacity):

```css
.tab-content {
  opacity: 0;
  transition: opacity 0.3s ease;
  display: none; /* Hidden by default */
}

.tab-content.is-active {
  opacity: 1;
  display: block; /* Shown when active */
}
```

### JavaScript

Simply include the provided script on your page. The script auto-initializes any `[data-tabs]` components in the DOM. No additional setup is required.

### Videos

If a `<video>` element resides in a tab content:
- It **plays** automatically when its tab is active (subject to browser autoplay policies).
- It **pauses** when its tab is hidden.

### Autoplay

With `data-tabs-autoplay` set, the tabs automatically rotate in order after the defined interval. When the last tab is reached, it loops back to the first. To disable autoplay, simply remove this attribute.

### Performance Considerations

- **Caching selectors & references:** Selectors are cached to minimize DOM interactions.
- **Transition synchronization:** The script uses both CSS transitions and fallback timers to ensure smooth content changes.
- **Optimized DOM updates:** Only necessary classes and attributes are updated during user interactions.

### Browser Support

- Supports all modern browsers.
- Older browsers may require polyfills for features such as `requestAnimationFrame` or CSS transitions.

### Advanced Customization

- **Custom Animations:**  
  Feel free to substitute or extend CSS transitions with libraries like GSAP. Ensure that `.is-active` and `display` handling remain consistent.
  
- **Accordion Mode:**  
  Adjust the logic to allow multiple panels open simultaneously if desired.
  
- **User Interaction Pause:**  
  Modify the script to pause autoplay when the user manually interacts with the tab controls.

## Conclusion

This system offers a robust, modular, and accessible solution for tabbed/accordion interfaces with minimal setup. Its attribute-based design supports automatic pairing of tabs and content, making it especially useful with Webflow Collection Lists where manual configuration might be impractical.