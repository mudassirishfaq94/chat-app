# Theming and Dark Mode Guidelines

This document describes the color palette, accessibility targets, and implementation rules for light/dark mode in Maddy Chat'z.

## Accessibility Targets
- Contrast: Minimum WCAG AA compliance (ratio ≥ 4.5:1 for normal text; ≥ 3:1 for large text ≥ 18pt/14pt bold).
- Motion: Respect the Reduce Motion preference (Settings → Accessibility) and `prefers-reduced-motion` via the `html.reduced-motion` class.
- Readability: Verify text across small (12–14px), normal (16–18px), and large (20–24px) sizes.

## Core Palette (Light)
- `--color-bg`: `#f8fafc` — page background
- `--color-surface`: `#ffffff` — panels/containers
- `--color-elevated`: `#f9fafb` — subtle elevated surfaces
- `--color-text`: `#0f172a` — primary text
- `--color-text-secondary`: `#334155` — secondary text
- `--color-border`: `#cbd5e1` — borders/dividers
- `--color-accent`: `#0ea5e9` — interactive/focus
- `--color-accent-contrast`: `#ffffff` — text on accent
- `--color-muted`: `#64748b` — placeholders/muted
- `--color-success`: `#10b981` — status (online dot)

## Core Palette (Dark)
- `--color-bg`: `#0B1220` — page background
- `--color-surface`: `#0F172A` — panels/containers
- `--color-elevated`: `#111827` — subtle elevations
- `--color-text`: `#E6EEF8` — primary text
- `--color-text-secondary`: `#C8D3E7` — secondary text
- `--color-border`: `#1F2937` — borders/dividers
- `--color-accent`: `#38BDF8` — interactive/focus
- `--color-accent-contrast`: `#0B1220` — text on accent
- `--color-muted`: `#94A3B8` — placeholders/muted
- `--color-success`: `#22c55e` — status (online dot)

All palette variables are defined on `:root` and overridden under `html.dark`.

## Implementation Rules
1. Global surfaces use variables:
   - `body`, `#appShell`, `header`, `#mobileNav`, `main`, `footer`, `#systemLog`, `#messages`, `#mobileFriends`, `#actionsMenu` map background, text, and border to the variables above.
2. Form controls:
   - `input`, `textarea`, `select` use `--color-surface` (background), `--color-text` (text), `--color-border` (border), placeholders use `--color-muted`.
   - Focus outline uses `--color-accent`.
3. Buttons:
   - Primary action buttons (e.g., `button.bg-slate-800`) are remapped to `--color-accent` with `--color-accent-contrast`.
   - Secondary buttons retain surface background and border from `--color-surface`/`--color-border`.
4. Utility overrides in dark mode:
   - `.bg-white`, `.bg-gray-50`, `.bg-slate-50`, `.bg-gray-100`, `.bg-slate-100` → `--color-surface`
   - `.text-slate-600`, `.text-gray-600`, `.text-slate-700`, `.text-gray-700` → `--color-text-secondary`
   - `.text-slate-800`, `.text-gray-800` → `--color-text`
   - `.border-gray-200`, `.border-gray-300` → `--color-border`
5. Bubbles:
   - Receiver bubbles (`.bg-gray-200`) darken and switch to light text under dark.
   - Sender bubbles (`.bg-blue-500`) use a darker blue (`#1e40af`) in dark.
6. Transitions:
   - Colors/borders transition smoothly (`~200ms`). Motion is disabled when `html.reduced-motion` is present.
7. Media dark variants:
   - Add `data-light-src` and `data-dark-src` attributes to `img`/`video`. Theme switching updates the source via `swapThemeMedia()`.
8. Mobile browser UI tint:
   - `setThemeColorMeta()` sets `<meta name="theme-color">` to `--color-bg`.
9. System mode:
   - When user selects System, `applyTheme('system')` mirrors `prefers-color-scheme`, and updates on changes.

## Usage Examples
- Add a dark variant image:
  ```html
  <img data-light-src="/images/logo-light.png" data-dark-src="/images/logo-dark.png" alt="Logo">
  ```
- Primary button:
  ```html
  <button class="bg-slate-800 text-white">Send</button>
  ```

## QA Checklist
- Verify theme switching Light/Dark/System updates all surfaces, controls, and menus.
- Check text contrast on small (12–14px), normal (16–18px), large (20–24px) sizes.
- Inspect focus outlines and hover states.
- Validate message bubble readability for long text and code blocks.
- Confirm reduced motion disables transitions.
- Confirm image/video sources swap with dark variants.
- Cross-browser: Chrome, Edge, Firefox, Safari (mobile).
