---
type: tech
applies: "apps/desktop/src/**"
updated: 2026-11-02
---

# Design tokens

```yaml
colors:
  flint:
    light: {"frame": "oklch(0.95  0.0049 250)", "tray": "oklch(0.985 0.0024 250)", "card": "oklch(0.995 0.0014 250)", "raise": "oklch(0.93  0.007  250)", "sheet": "oklch(0.998 0.0007 250)", "line": "oklch(0.885 0.007  250)", "input": "oklch(0.61  0.0098 250)", "fg": "oklch(0.23  0.0098 250)", "muted": "oklch(0.47  0.0126 250)", "signal": "oklch(0.23  0.0098 250)", "mark": "oklch(0.55  0.012  250)", "ember": "oklch(0.52 0.15 45)", "ember-bg": "oklch(0.95 0.035 60)", "ember-fg": "oklch(0.45 0.13 45)", "danger": "oklch(0.54 0.2 25)", "shadow-card": "0 1px 2px oklch(0.3 0.03 250 / 0.08), 0 0 0 1px var(--sh-line)", "shadow-tray": "0 0 0 1px oklch(0.9 0.007 250), 0 1px 3px oklch(0.3 0.03 250 / 0.08)", "shadow-lift": "0 0 0 1px oklch(0.88 0.007 250), 0 24px 60px oklch(0.3 0.04 250 / 0.18)", "scrim": "oklch(0.3 0.01 250 / 0.28)"}
    dark: {"frame": "oklch(0.17  0.007  250)", "tray": "oklch(0.197 0.007  250)", "card": "oklch(0.205 0.0077 250)", "raise": "oklch(0.26  0.0077 250)", "sheet": "oklch(0.235 0.0077 250)", "line": "oklch(0.295 0.0077 250)", "input": "oklch(0.56  0.0098 250)", "fg": "oklch(0.94  0.0035 250)", "muted": "oklch(0.75  0.0084 250)", "signal": "oklch(0.94  0.0035 250)", "mark": "oklch(0.66  0.01   250)", "ember": "oklch(0.77 0.14 58)", "ember-bg": "oklch(0.31 0.065 52)", "ember-fg": "oklch(0.91 0.07 65)", "danger": "oklch(0.68 0.19 25)", "shadow-card": "0 0 0 1px oklch(0.28 0.007 250)", "shadow-tray": "inset 0 1px 0 oklch(1 0 0 / 0.04), 0 0 0 1px oklch(0.25 0.007 250), 0 2px 6px oklch(0.05 0.01 250 / 0.45)", "shadow-lift": "0 0 0 1px oklch(0.33 0.007 250), 0 24px 60px oklch(0.05 0.01 250 / 0.55)", "scrim": "oklch(0.08 0.005 250 / 0.6)"}
  jade:
    light: {"frame": "oklch(0.95 0.0126 165)", "tray": "oklch(0.985 0.0063 165)", "card": "oklch(0.995 0.0036 165)", "raise": "oklch(0.93 0.018 165)", "sheet": "oklch(0.998 0.0018 165)", "line": "oklch(0.885 0.018 165)", "input": "oklch(0.61 0.0252 165)", "fg": "oklch(0.23 0.0252 165)", "muted": "oklch(0.47 0.0324 165)", "signal": "oklch(0.48 0.09 165)", "mark": "oklch(0.48 0.09 165)", "ember": "oklch(0.52 0.15 45)", "ember-bg": "oklch(0.95 0.035 60)", "ember-fg": "oklch(0.45 0.13 45)", "danger": "oklch(0.54 0.2 25)", "shadow-card": "0 1px 2px oklch(0.3 0.03 250 / 0.08), 0 0 0 1px var(--sh-line)", "shadow-tray": "0 0 0 1px oklch(0.9 0.007 250), 0 1px 3px oklch(0.3 0.03 250 / 0.08)", "shadow-lift": "0 0 0 1px oklch(0.88 0.007 250), 0 24px 60px oklch(0.3 0.04 250 / 0.18)", "scrim": "oklch(0.3 0.01 250 / 0.28)"}
    dark: {"frame": "oklch(0.17 0.018 165)", "tray": "oklch(0.197 0.018 165)", "card": "oklch(0.205 0.0198 165)", "raise": "oklch(0.26 0.0198 165)", "sheet": "oklch(0.235 0.0198 165)", "line": "oklch(0.295 0.0198 165)", "input": "oklch(0.56 0.0252 165)", "fg": "oklch(0.94 0.009 165)", "muted": "oklch(0.75 0.0216 165)", "signal": "oklch(0.82 0.1 165)", "mark": "oklch(0.82 0.1 165)", "ember": "oklch(0.77 0.14 58)", "ember-bg": "oklch(0.31 0.065 52)", "ember-fg": "oklch(0.91 0.07 65)", "danger": "oklch(0.68 0.19 25)", "shadow-card": "0 0 0 1px oklch(0.28 0.007 250)", "shadow-tray": "inset 0 1px 0 oklch(1 0 0 / 0.04), 0 0 0 1px oklch(0.25 0.007 250), 0 2px 6px oklch(0.05 0.01 250 / 0.45)", "shadow-lift": "0 0 0 1px oklch(0.33 0.007 250), 0 24px 60px oklch(0.05 0.01 250 / 0.55)", "scrim": "oklch(0.08 0.005 250 / 0.6)"}
  moonstone:
    light: {"frame": "oklch(0.95 0.0112 285)", "tray": "oklch(0.985 0.0056 285)", "card": "oklch(0.995 0.0032 285)", "raise": "oklch(0.93 0.016 285)", "sheet": "oklch(0.998 0.0016 285)", "line": "oklch(0.885 0.016 285)", "input": "oklch(0.61 0.0224 285)", "fg": "oklch(0.23 0.0224 285)", "muted": "oklch(0.47 0.0288 285)", "signal": "oklch(0.48 0.08 285)", "mark": "oklch(0.48 0.08 285)", "ember": "oklch(0.52 0.15 45)", "ember-bg": "oklch(0.95 0.035 60)", "ember-fg": "oklch(0.45 0.13 45)", "danger": "oklch(0.54 0.2 25)", "shadow-card": "0 1px 2px oklch(0.3 0.03 250 / 0.08), 0 0 0 1px var(--sh-line)", "shadow-tray": "0 0 0 1px oklch(0.9 0.007 250), 0 1px 3px oklch(0.3 0.03 250 / 0.08)", "shadow-lift": "0 0 0 1px oklch(0.88 0.007 250), 0 24px 60px oklch(0.3 0.04 250 / 0.18)", "scrim": "oklch(0.3 0.01 250 / 0.28)"}
    dark: {"frame": "oklch(0.17 0.016 285)", "tray": "oklch(0.197 0.016 285)", "card": "oklch(0.205 0.0176 285)", "raise": "oklch(0.26 0.0176 285)", "sheet": "oklch(0.235 0.0176 285)", "line": "oklch(0.295 0.0176 285)", "input": "oklch(0.56 0.0224 285)", "fg": "oklch(0.94 0.008 285)", "muted": "oklch(0.75 0.0192 285)", "signal": "oklch(0.82 0.06 285)", "mark": "oklch(0.82 0.06 285)", "ember": "oklch(0.77 0.14 58)", "ember-bg": "oklch(0.31 0.065 52)", "ember-fg": "oklch(0.91 0.07 65)", "danger": "oklch(0.68 0.19 25)", "shadow-card": "0 0 0 1px oklch(0.28 0.007 250)", "shadow-tray": "inset 0 1px 0 oklch(1 0 0 / 0.04), 0 0 0 1px oklch(0.25 0.007 250), 0 2px 6px oklch(0.05 0.01 250 / 0.45)", "shadow-lift": "0 0 0 1px oklch(0.33 0.007 250), 0 24px 60px oklch(0.05 0.01 250 / 0.55)", "scrim": "oklch(0.08 0.005 250 / 0.6)"}
  sandstone:
    light: {"frame": "oklch(0.95 0.0126 80)", "tray": "oklch(0.985 0.0063 80)", "card": "oklch(0.995 0.0036 80)", "raise": "oklch(0.93 0.018 80)", "sheet": "oklch(0.998 0.0018 80)", "line": "oklch(0.885 0.018 80)", "input": "oklch(0.61 0.0252 80)", "fg": "oklch(0.23 0.0252 80)", "muted": "oklch(0.47 0.0324 80)", "signal": "oklch(0.5 0.07 75)", "mark": "oklch(0.5 0.07 75)", "ember": "oklch(0.52 0.15 45)", "ember-bg": "oklch(0.95 0.035 60)", "ember-fg": "oklch(0.45 0.13 45)", "danger": "oklch(0.54 0.2 25)", "shadow-card": "0 1px 2px oklch(0.3 0.03 250 / 0.08), 0 0 0 1px var(--sh-line)", "shadow-tray": "0 0 0 1px oklch(0.9 0.007 250), 0 1px 3px oklch(0.3 0.03 250 / 0.08)", "shadow-lift": "0 0 0 1px oklch(0.88 0.007 250), 0 24px 60px oklch(0.3 0.04 250 / 0.18)", "scrim": "oklch(0.3 0.01 250 / 0.28)"}
    dark: {"frame": "oklch(0.17 0.018 80)", "tray": "oklch(0.197 0.018 80)", "card": "oklch(0.205 0.0198 80)", "raise": "oklch(0.26 0.0198 80)", "sheet": "oklch(0.235 0.0198 80)", "line": "oklch(0.295 0.0198 80)", "input": "oklch(0.56 0.0252 80)", "fg": "oklch(0.94 0.009 80)", "muted": "oklch(0.75 0.0216 80)", "signal": "oklch(0.84 0.07 82)", "mark": "oklch(0.84 0.07 82)", "ember": "oklch(0.77 0.14 58)", "ember-bg": "oklch(0.31 0.065 52)", "ember-fg": "oklch(0.91 0.07 65)", "danger": "oklch(0.68 0.19 25)", "shadow-card": "0 0 0 1px oklch(0.28 0.007 250)", "shadow-tray": "inset 0 1px 0 oklch(1 0 0 / 0.04), 0 0 0 1px oklch(0.25 0.007 250), 0 2px 6px oklch(0.05 0.01 250 / 0.45)", "shadow-lift": "0 0 0 1px oklch(0.33 0.007 250), 0 24px 60px oklch(0.05 0.01 250 / 0.55)", "scrim": "oklch(0.08 0.005 250 / 0.6)"}
typography:
  display: {fontFamily: "Newsreader, Georgia, serif", fontSize: 32px, lineHeight: 1.1, fontWeight: 500}
  title: {fontFamily: "Newsreader, Georgia, serif", fontSize: 24px, lineHeight: 1.2, fontWeight: 500}
  focus: {fontFamily: "Newsreader, Georgia, serif", fontSize: 44px, lineHeight: 1.05, fontWeight: 500}
  body: {fontFamily: "Hanken Grotesk, system-ui, sans-serif", fontSize: 14.5px, lineHeight: 1.35}
  reader: {fontFamily: "Hanken Grotesk, system-ui, sans-serif", fontSize: 15px, lineHeight: 1.65}
  mono: {fontFamily: "JetBrains Mono, ui-monospace, monospace", fontSize: 12px, lineHeight: 1.4}
rounded: {kbd: 5px, chip: 6px, nav: 9px, control: 10px, row: 12px, tray: 14px, sheet: 16px, card: 18px, human: 9999px, agent: "28%"}
spacing: {xs: 4px, sm: 8px, md: 12px, lg: 16px, xl: 24px, row: 44px, row-compact: 36px, row-focus: 46px, sidebar: 224px, detail: 372px, focus: 620px, palette: 620px}
components:
  task-row: {height: "{spacing.row}", rounded: "{rounded.row}", background: transparent, selected: raise}
  sidebar-tray: {rounded: "{rounded.tray}", background: tray}
  detail-sheet: {width: "{spacing.detail}", rounded: "{rounded.sheet}", background: sheet}
  checkbox: {size: 16px, rounded: 9999px, stroke: 1.5px}
  avatar-human: {shape: circle, content: initials}
  avatar-agent: {shape: squircle, content: local-art-or-bot-glyph}
  focus-ring: {width: 2px, opacity: 1, token: muted}
motion:
  durations: {instant: 80ms, quick: 140ms, base: 200ms, slow: 320ms}
  easing: {enter: "cubic-bezier(0.2, 0, 0, 1)", leave: "cubic-bezier(0.4, 0, 1, 1)", move: "cubic-bezier(0.3, 0, 0, 1)"}
  reduced: "No layout, slide, blur or pulse animation; transitions at most 120ms"
```

Parent: [Design system](README.md).
