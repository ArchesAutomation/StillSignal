// Component tests exercise behavior in JSDOM. CSS and browser media queries
// are checked separately in Chrome against the running app.
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const windowGetter = Object.getOwnPropertyDescriptor(JSDOM.prototype, "window").get;
Object.defineProperty(JSDOM.prototype, "window", {
  configurable: true,
  get() {
    const window = windowGetter.call(this);
    window.matchMedia ??= query => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return true; } });
    return window;
  },
});
