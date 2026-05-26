# Highland Cal Visual Design Guide

## Core Philosophy
The Highland Cal platform merges the rugged, traditional spirit of the Scottish Highland Games with a highly premium, modern digital experience. The interface feels **dynamic, warm, and extremely premium**, favoring immersive visual hierarchies, natural forest and gold themes, and smooth micro-animations over generic tech-SaaS blue styles.

---

## 1. Color Palette & Theming
Instead of flat gray seas or generic blues, Highland Cal leverages a cohesive, vibrant palette inspired by the Scottish Highlands:

* **Primary Brand Colors**: Draw inspiration from misty highland hills and traditional events:
  - **Forest & Emerald Greens**: `emerald-600`, `emerald-700`, and `emerald-850`/`from-emerald-950` for premium accents, borders, and main theme actions.
  - **Gold & Warm Amber**: `amber-500`, `amber-450`, and `text-amber-500` for highlights, warning/pending states, calendar icons, and CTA badges.
* **Page Backgrounds**: Subtle, screen-wide natural gradients that transition gracefully:
  - **Light Mode**: `bg-gradient-to-br from-emerald-50/40 via-stone-50/30 to-amber-50/20` to give depth without distracting from content.
  - **Dark Mode**: `bg-gradient-to-br from-emerald-950/25 via-slate-950 to-slate-950`.
* **Dark Mode Compatibility**: All custom components must support native dark mode classes (`dark:...`). Ensure soft background cards utilize `bg-slate-900/60` or `bg-slate-950/80` with semi-transparent emerald borders to pop beautifully on dark screens.

---

## 2. Immersive Two-Column Hero Sections
The landing page hero is designed for instant emotional impact and instant clarity:

* **Two-Column Desktop Hero**:
  - **Left Column (Welcome & Purpose)**: Bold, premium gradient headers introducing the club, paired with clean checkmarks highlighting core club utilities ("Find Local Events", "Meet Our Competitors", "Track Who is Throwing").
  - **Right Column (Dynamic Club Card)**: Houses the uploaded hero banner image with a high-contrast glassmorphism card (`backdrop-blur-xl bg-white/70 dark:bg-slate-900/70 border border-white/20`) that hosts the club name, local details, subscription links, and sign-in controls.
* **Text Readability**: Use text drop shadows (`drop-shadow-sm` or `drop-shadow-md`) on dynamic text blocks overlaying rich background images.

---

## 3. Card Design & Micro-Animations
Cards are designed to reward interaction and look tactile:

* **Glassmorphism**: Combine `backdrop-blur-xl bg-white/70 dark:bg-slate-900/60` with soft borders like `border-slate-200/50 dark:border-slate-800/40` so gradient background colors subtly gleam through.
* **Depth over Borders**: Favor soft drop shadows (`shadow-md` resting, `shadow-xl` hovered) over harsh borders. 
* **Interactive Hover States**: Apply scale and offset transitions to cards and main buttons (`transition-all duration-300 hover:-translate-y-1 hover:shadow-lg`).
* **100% Clickable Roster & Profile Cards**:
  - Double down on the collectible baseball card feel: standard card layout shows an athlete action photo with an aspect ratio of `aspect-[4/5]`.
  - **Fully Clickable**: Use an absolute link overlay (`absolute inset-0 z-10`) wrapping the entire profile card so the user can click anywhere to view details.
  - **Interactive Links**: Social icons (like Instagram/Facebook) must be elevated using `relative z-20 pointer-events-auto` so they remain directly clickable independently of the main card click.

---

## 4. Layouts & Information Architecture
Avoid long, flat vertical stacks. Use dynamic sidebars on desktop:

* **Double-Column Page Layout**:
  - **Main Column (width 8/12)**: Lists upcoming games and practices using spacious cards with color-coded event type badges.
  - **Sidebar Column (width 4/12)**: A sticky panel (`sticky top-6`) housing auxiliary widgets:
    - **Who's Throwing Next?**: Programmatic widget looking up the nearest upcoming event and showing the profile avatars of registered athletes.
    - **Club Stats**: Grid displays showing numeric tallies of approved roster athletes and scheduled games with bold forest green and gold typography.
* **Mobile Responsiveness**: All double-column grids must use tailwind responsiveness (`grid grid-cols-1 lg:grid-cols-12` or `flex-col lg:flex-row`) to stack cleanly into a single column on mobile viewports.

---

## 5. Typography & Text Content
* **Premium Fonts**: Utilize modern geometric sans-serif fonts (*Geist* or *Inter*) mapped to the body layout.
* **Gradient Headers**: Use gradient clipping for major titles:
  - `bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 via-emerald-700 to-amber-600`
* **Status Badges**:
  - `APPROVED` / `GAME` / `PRACTICE` should feel vibrant, utilizing translucent backgrounds and bold, matching text colors:
    - **GAME State**: `bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20`
    - **PRACTICE State**: `bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20`
    - **ADMIN State**: `bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 border border-fuchsia-500/20`

---

## Checklist for New Components
- [ ] Does this component look beautiful on mobile screen sizes down to 320px?
- [ ] Have I used grid/flexbox to maximize space on desktop?
- [ ] Are all interactive hover states implemented (scaling, shadows)?
- [ ] Is the primary CTA highlighted with the emerald green or gold amber color palette?
- [ ] Does it use soft shadows and depth rather than flat grays?
