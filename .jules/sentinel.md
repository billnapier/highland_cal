## 2024-02-14 - Zod URL Validation XSS Risk
**Vulnerability:** Stored XSS via `z.string().url()` mapping to React `href` attributes.
**Learning:** Zod's `url()` validation accepts any valid URL protocol, including `javascript:`, `mailto:`, etc. When these URLs are saved and later rendered directly into a React `<a>` tag's `href` attribute (e.g. `<a href={game.registration_url}>`), it creates a Stored XSS vulnerability where an attacker can execute arbitrary JavaScript in the victim's browser.
**Prevention:** Always sanitize URLs before storing or rendering them. Use a preprocessing function with Zod to enforce safe protocols (e.g., `http://` or `https://`). Prepending `https://` to inputs without a protocol or with unsafe protocols neutralizes the `javascript:` attack vector.
## 2024-07-23 - Open Redirect via `next` Parameter
**Vulnerability:** Open Redirect in OAuth callback route.
**Learning:** When using a `next` redirect parameter in OAuth callbacks or route handlers, appending it directly to the origin (`origin + next` or `${origin}${next}`) without validation allows attackers to craft malicious URLs (e.g., `?next=//malicious.com` or `?next=@malicious.com`). This redirects users to external sites, potentially facilitating phishing attacks.
**Prevention:** Always validate and sanitize user-provided redirect parameters. Ensure the path strictly starts with a single `/` and not `//` before performing the redirect (e.g., `if (!next.startsWith('/') || next.startsWith('//')) { next = '/dashboard' }`).
