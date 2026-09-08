# Techmino Web Client on Cloudflare Pages

This overlay adds a standalone Love.js Web client to a clean clone of the official Techmino repository. It does not include the multiplayer server.

## Install

Merge this overlay into the root of a clean Techmino clone while preserving the directories.

## Cloudflare Pages settings

| Setting | Value |
| --- | --- |
| Root directory | Repository root |
| Build command | `npm run build` |
| Build output directory | `dist` |

Add this build-time environment variable:

| Variable | Example |
| --- | --- |
| `TECHMINO_SERVER_URL` | `https://techrater.example.com` |

Do not include a trailing slash. This must be the public URL of the separate Techrater Worker.

## Included Web fixes

- IndexedDB save flushing for Safari and other browsers
- WebSocket support through the JavaScript bridge
- Supabase anonymous-session refresh recovery
- Stable guest identity and fallback guest names
- LÖVE 11.4 compatibility declaration for the Love.js runtime
- A cache policy that forces browsers to revalidate updated game files

## Local build

```sh
npm ci
TECHMINO_SERVER_URL=https://techrater.example.com npm run build
```

The generated site is written to `dist`.
