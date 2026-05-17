# Highland Cal Visual Design Guide

## Core Philosophy
The Highland Cal platform aims to merge the rugged, traditional spirit of the Scottish Highland Games with a highly premium, modern digital experience. The interface should feel **dynamic, inviting, and professional**, favoring immersive visual hierarchies over plain, utilitarian layouts.

## 1. Color Palette & Theming
Avoid relying solely on default black, white, and grays. The application should feel alive.

* **Primary Brand Colors**: Draw inspiration from Highland environments—deep forest greens, rich tartans, and vibrant gold/amber for accents and calls to action.
* **Dark Mode Compatibility**: All colors must gracefully transition to dark mode. Ensure contrast ratios remain accessible. Use deeper muted tones for backgrounds (e.g., `bg-background` and `bg-card`) to let images and badges pop.

## 2. Immersive Headers & Hero Sections
Do not stack text and images vertically if they can be combined for emotional impact.

* **Full-bleed Images**: Use `object-cover` and absolute positioning to make hero images span the full width and height of their container.
* **Glassmorphism Overlay**: Ensure text remains legible over varied images by using "glassmorphism" cards (`backdrop-blur-md bg-black/40 border border-white/20`). This provides a sleek, frosted-glass effect that feels incredibly premium.
* **Text Shadows**: Use `drop-shadow-lg` on large header text positioned directly over images to guarantee readability.

## 3. Card Design & Micro-Animations
Interactive elements should reward the user for interacting with them.

* **Depth over Borders**: Use soft drop shadows (`shadow-sm` resting, `shadow-xl` hovered) instead of harsh, high-contrast borders.
* **Hover States**: Apply subtle scale and translation transformations to cards and primary buttons (e.g., `transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`). It makes the interface feel tactile.
* **Profile "Player" Cards**: For athlete rosters or user profiles, mimic a trading card or social media profile. Include a gradient banner at the top, an overlapping rounded avatar, and prominent class badges.

## 4. Layouts & Information Architecture
Avoid long, single-column walls of text on desktop viewports.

* **Bento Box Grids**: Group distinct types of information (e.g., Account Status, Quick Links, Upcoming Events) into separate cards arranged in a grid (`grid-cols-1 md:grid-cols-3`). 
* **Sticky Sidebars**: On larger screens, pin secondary but important actions (like a user profile summary or navigation links) to the side using `sticky top-6`. This prevents unnecessary scrolling and utilizes horizontal space efficiently.
* **Mobile-First Stacking**: Ensure that multi-column CSS grids collapse elegantly into a single column on mobile devices. Prioritize the order of stacked elements (e.g., show the "Account Status" card before the long list of "Upcoming Events").

## 5. Typography & Badges
* **Premium Fonts**: Favor modern, geometric sans-serif fonts (like *Geist*, *Inter*, or *Outfit*) over system defaults.
* **Status Indicators**: Use vibrant, color-coded badges to indicate state. Avoid plain text for statuses.
  * `APPROVED` → Green (`bg-green-100 text-green-800`)
  * `PENDING` → Yellow/Amber (`bg-yellow-100 text-yellow-800`)
  * `ADMIN` → Purple (`bg-purple-100 text-purple-800`)
  * `PRACTICE` vs `GAME` events should be visually distinct at a glance.

## Checklist for New Components
- [ ] Does this component look good on a 320px wide mobile screen?
- [ ] Have I used grid/flexbox to maximize space on desktop?
- [ ] Are there hover states for interactive elements (shadows, subtle scaling)?
- [ ] Is the primary call-to-action visually distinct?
- [ ] Does it use soft shadows and depth rather than just flat borders?
