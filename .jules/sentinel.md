## 2024-02-14 - Zod URL Validation XSS Risk
**Vulnerability:** Stored XSS via `z.string().url()` mapping to React `href` attributes.
**Learning:** Zod's `url()` validation accepts any valid URL protocol, including `javascript:`, `mailto:`, etc. When these URLs are saved and later rendered directly into a React `<a>` tag's `href` attribute (e.g. `<a href={game.registration_url}>`), it creates a Stored XSS vulnerability where an attacker can execute arbitrary JavaScript in the victim's browser.
**Prevention:** Always sanitize URLs before storing or rendering them. Use a preprocessing function with Zod to enforce safe protocols (e.g., `http://` or `https://`). Prepending `https://` to inputs without a protocol or with unsafe protocols neutralizes the `javascript:` attack vector.

## 2024-07-22 - Open Redirect in Auth Callback
**Vulnerability:** Open Redirect via `next` query parameter in `app/auth/callback/route.ts`.
**Learning:** Concatenating `origin + next` where `next` is an unverified user input allows attackers to bypass typical path validations using `//attacker.com` (protocol-relative) or `@attacker.com` (which parses as `https://example.com@attacker.com`, effectively redirecting to `attacker.com` with `example.com` as a username credential).
**Prevention:** Always sanitize the `next` parameter to strictly enforce it is a relative path starting with a single `/` and not starting with `//` before performing the redirect.
