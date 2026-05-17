# Highland Cal Visual Design Guide

## Core Philosophy
The Highland Cal platform aims to merge the rugged, traditional spirit of the Scottish Highland Games with a highly premium, modern digital experience. The interface should feel **dynamic, inviting, and professional**, favoring immersive visual hierarchies over plain, utilitarian layouts.

## 1. Color Palette & Theming
Avoid relying solely on default black, white, and grays. The application should feel alive.

* **Primary Brand Colors**: Draw inspiration from Highland environments—deep forest greens, rich tartans, and vibrant gold/amber for accents and calls to action.
* **Page Backgrounds**: Use screen-wide subtle gradient backgrounds (e.g., `bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/80` and corresponding dark mode variants) to give the page depth and a premium feel, avoiding flat white or black backgrounds.
* **Dark Mode Compatibility**: All colors must gracefully transition to dark mode. Ensure contrast ratios remain accessible. Use deeper muted tones for backgrounds (e.g., `bg-background` and `bg-card`) to let images and badges pop.

## 2. Immersive Headers & Hero Sections
Do not stack text and images vertically if they can be combined for emotional impact.

* **Full-bleed Images**: Use `object-cover` and absolute positioning to make hero images span the full width and height of their container.
* **Glassmorphism Overlay**: Ensure text remains legible over varied images by using "glassmorphism" cards (`backdrop-blur-md bg-black/40 border border-white/20`). This provides a sleek, frosted-glass effect that feels incredibly premium.
* **Text Shadows**: Use `drop-shadow-lg` on large header text positioned directly over images to guarantee readability.

## 3. Card Design & Micro-Animations
Interactive elements should reward the user for interacting with them.

* **Glassmorphism**: Enhance standard cards using `backdrop-blur-xl` combined with semi-transparent backgrounds (e.g., `bg-white/80 dark:bg-slate-900/80`). This allows the underlying page gradients to subtly shine through, increasing the sense of depth.
* **Depth over Borders**: Use soft drop shadows (`shadow-sm` resting, `shadow-xl` hovered) instead of harsh, high-contrast borders. Combine with translucent borders (e.g., `border-slate-200/60`).
* **Hover States**: Apply subtle scale and translation transformations to cards and primary buttons (e.g., `transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-blue-300`). It makes the interface feel tactile.
* **Baseball "Player" Cards**: For athlete rosters, double down on the collectible feel. Use a full, rectangular action shot spanning the majority of the card (e.g., `aspect-[4/5]`), rather than small circular avatars. Overlay names on a soft bottom gradient over the photo, position class badges as premium stickers in the top corner, and format the bottom nameplate with stats/social links.

## 4. Layouts & Information Architecture
Avoid long, single-column walls of text on desktop viewports.

* **Bento Box Grids**: Group distinct types of information (e.g., Account Status, Quick Links, Upcoming Events) into separate cards arranged in a grid (`grid-cols-1 md:grid-cols-3`). 
* **Sticky Sidebars**: On larger screens, pin secondary but important actions (like a user profile summary or navigation links) to the side using `sticky top-6`. This prevents unnecessary scrolling and utilizes horizontal space efficiently.
* **Mobile-First Stacking**: Ensure that multi-column CSS grids collapse elegantly into a single column on mobile devices. Prioritize the order of stacked elements (e.g., show the "Account Status" card before the long list of "Upcoming Events").

## 5. Typography & Text Content
* **Premium Fonts**: Favor modern, geometric sans-serif fonts (like *Geist*, *Inter*, or *Outfit*) over system defaults.
* **Gradient Headers**: Use gradient text clipping (e.g., `bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600`) for primary page headers (`<h1>`, `<h2>`) to draw the eye and elevate the design.
* **Avoid Truncation**: Allow user-generated content (like custom link titles) to display fully whenever possible. Avoid aggressive text truncation on interactive elements to ensure clarity.
* **Status Indicators**: Use vibrant, color-coded gradient badges with bold white text and a subtle translucent ring to indicate state. Avoid plain text or pale muted colors for statuses.
  * `APPROVED` → Emerald/Teal Gradient (`bg-gradient-to-r from-emerald-400 to-teal-500 text-white`)
  * `PENDING` → Amber/Orange Gradient (`bg-gradient-to-r from-amber-400 to-orange-500 text-white`)
  * `ADMIN` → Fuchsia/Purple Gradient (`bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white`)
  * `PRACTICE` vs `GAME` events should be visually distinct at a glance (e.g., Purple/Fuchsia gradient for Practice).

## Checklist for New Components
- [ ] Does this component look good on a 320px wide mobile screen?
- [ ] Have I used grid/flexbox to maximize space on desktop?
- [ ] Are there hover states for interactive elements (shadows, subtle scaling)?
- [ ] Is the primary call-to-action visually distinct?
- [ ] Does it use soft shadows and depth rather than just flat borders?
