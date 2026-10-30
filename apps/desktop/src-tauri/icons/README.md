# Shards app icons

`app-icon.svg` is the native icon source. It uses the same two-facet pebble geometry as
the in-app Shards mark and the browser favicon. The charcoal tile remains neutral in
every app appearance.

Regenerate the platform assets from the repository root:

```sh
pnpm -C apps/desktop tauri icon src-tauri/icons/app-icon.svg --output src-tauri/icons --ios-color '#151719'
```

Keep the SVG source. Do not replace generated PNG, ICNS or ICO files individually.
`public/favicon.svg` uses the same two polygons with light/dark browser-tab colors.
The favicon stays untiled so its silhouette remains legible at 16 pixels.
