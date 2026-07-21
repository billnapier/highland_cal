## 2024-02-14 - Zod URL Validation XSS Risk
**Vulnerability:** Stored XSS via `z.string().url()` mapping to React `href` attributes.
**Learning:** Zod's `url()` validation accepts any valid URL protocol, including `javascript:`, `mailto:`, etc. When these URLs are saved and later rendered directly into a React `<a>` tag's `href` attribute (e.g. `<a href={game.registration_url}>`), it creates a Stored XSS vulnerability where an attacker can execute arbitrary JavaScript in the victim's browser.
**Prevention:** Always sanitize URLs before storing or rendering them. Use a preprocessing function with Zod to enforce safe protocols (e.g., `http://` or `https://`). Prepending `https://` to inputs without a protocol or with unsafe protocols neutralizes the `javascript:` attack vector.

## 2024-03-20 - Next.js OAuth Callback Open Redirect Risk
**Vulnerability:** Open redirect via unsanitized `next` URL parameter in OAuth callback route (`app/auth/callback/route.ts`).
**Learning:** Constructing redirect URLs by simply concatenating `origin + next` is unsafe if `next` is user-controlled. Attackers can supply absolute URLs without a protocol like `//attacker.com` or `@attacker.com`, which `new URL()` or browser redirect will resolve to `https://attacker.com` if appended directly to the origin. This can lead to users being redirected to malicious phishing sites after login.
**Prevention:** Always validate and sanitize user-controlled redirect parameters to ensure they are safe relative paths. Ensure the parameter starts with a single `/` and explicitly reject paths starting with `//` to prevent protocol-relative redirects.
