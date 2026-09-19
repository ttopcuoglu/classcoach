# edinexa.com

Company site for Edinexa Technologies LLC. Plain static HTML/CSS, no build step.

## Deploy on Render

1. Push this repo to GitHub.
2. Render → **New → Static Site** → pick the repo.
3. Settings:
   - **Root Directory:** `edinexa-site`
   - **Build Command:** leave empty
   - **Publish Directory:** `.`
4. After the first deploy: **Settings → Custom Domains** → add `edinexa.com` and `www.edinexa.com`.
5. In GoDaddy → **DNS**, add the records Render shows (typically an `A` record for `@` and a
   `CNAME` for `www` → `<your-site>.onrender.com`). Remove GoDaddy's parked `A` record for `@` first.
   Leave any `MX` records for email alone.

Render issues the HTTPS certificate automatically once DNS resolves.

## Editing

- Contact emails live in `index.html` (Contact section + footer) and `privacy.html`.
- Screenshots/logos are in `assets/`. Originals are in `../Wivoza-Assets/`.
