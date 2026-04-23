// theme v3 — gagent palette, page-break controls, footnote support,
// chip-on-panel fix, illustrative diagram primitives

#let colors = (
  // PRIMARY — Orbit purple
  primary: rgb("#7b5aff"),
  primary-dark: rgb("#5a3fd4"),
  primary-light: rgb("#cdbeff"),
  primary-wash: rgb("#f3efff"),

  // SECONDARY — light blue
  secondary: rgb("#348cab"),
  secondary-dark: rgb("#1f6680"),
  secondary-light: rgb("#b8dde9"),
  secondary-wash: rgb("#eef7fa"),

  // semantic
  success: rgb("#53cc7e"),
  success-wash: rgb("#e8f8ee"),
  warning: rgb("#f5a524"),
  warning-wash: rgb("#fdf1de"),
  danger: rgb("#f31260"),
  danger-wash: rgb("#fde0ea"),

  gradient-start: rgb("#7c3aed"),
  gradient-end: rgb("#06b6d4"),

  // neutral
  ink: rgb("#0f172a"),
  ink-soft: rgb("#334155"),
  muted: rgb("#64748b"),
  rule: rgb("#e4e4ed"),
  page-bg: rgb("#fafaff"),
  card: rgb("#ffffff"),
  bg-code: rgb("#f1eefc"),
)

#let report(
  title: "",
  subtitle: "",
  date: "",
  version: "",
  doc-type: "",
  body,
) = {
  set document(title: title, author: "r-n-d")
  set page(
    paper: "a4",
    margin: (top: 2.4cm, bottom: 2.2cm, left: 2.2cm, right: 2.2cm),
    fill: colors.page-bg,
    header: context {
      if counter(page).get().first() > 1 [
        #set text(size: 8pt, fill: colors.muted)
        #grid(
          columns: (1fr, auto),
          align: (left, right),
          [r-n-d report #h(0.3em) · #h(0.3em) #doc-type],
          [#title #sym.bullet #date],
        )
        #v(-0.3em)
        #line(length: 100%, stroke: 0.4pt + colors.rule)
      ]
    },
    footer: context {
      set text(size: 8pt, fill: colors.muted)
      grid(
        columns: (1fr, auto, 1fr),
        align: (left, center, right),
        [confidential #sym.bullet ghaia internal],
        [#counter(page).display("1 / 1", both: true)],
        [v#version],
      )
    },
  )

  set text(
    font: ("Inter", "Helvetica Neue", "Arial"),
    size: 10pt,
    fill: colors.ink,
    lang: "en",
  )
  set par(justify: true, leading: 0.62em, first-line-indent: 0em)
  set heading(numbering: none)

  show heading.where(level: 1): it => block(breakable: false, below: 0.8em)[
    #v(0.6em)
    #set text(size: 18pt, weight: 700, fill: colors.ink)
    #it.body
    #v(0.2em)
    #line(length: 2.5em, stroke: 2.5pt + colors.primary)
    #v(0.3em)
  ]
  show heading.where(level: 2): it => block(breakable: false, below: 0.6em)[
    #v(0.7em)
    #set text(size: 13pt, weight: 700, fill: colors.ink)
    #it.body
  ]
  show heading.where(level: 3): it => block(breakable: false, below: 0.55em)[
    #v(0.5em)
    #set text(size: 10.5pt, weight: 700, fill: colors.primary-dark)
    #it.body
  ]

  show raw: set text(font: ("JetBrains Mono", "Menlo", "Courier"), size: 9pt)
  show raw.where(block: true): block.with(
    fill: colors.bg-code, inset: 10pt, radius: 4pt, width: 100%,
  )
  show table.cell.where(y: 0): set text(weight: 700, fill: white)
  show link: set text(fill: colors.primary-dark)
  show footnote.entry: set text(size: 8pt, fill: colors.ink-soft)

  block(
    width: 100%,
    inset: (top: 0pt, bottom: 1.2em),
  )[
    #set text(fill: colors.muted, size: 9pt, weight: 600)
    #upper[r-n-d report #sym.bullet #doc-type]
    #v(0.3em)
    #set text(fill: colors.ink, size: 26pt, weight: 800)
    #title
    #v(0.1em)
    #set text(fill: colors.muted, size: 12pt, weight: 400)
    #subtitle
    #v(0.7em)
    #line(length: 100%, stroke: 0.6pt + colors.rule)
    #v(0.3em)
    #set text(fill: colors.muted, size: 9pt)
    #grid(
      columns: (auto, 1fr, auto, auto),
      column-gutter: 0.6em,
      row-gutter: 0.3em,
      [*date*], [#date], [*version*], [v#version],
    )
  ]

  body
}

// --- icons (real glyphs) ----------------------------------------------------
#let icon-check = text(fill: colors.success, weight: 900)[#sym.checkmark]
#let icon-cross = text(fill: colors.danger, weight: 900)[#sym.times]
#let icon-warn  = text(fill: colors.warning, weight: 900)[#sym.triangle.filled.t]
#let icon-info  = text(fill: colors.primary, weight: 900)[#sym.circle.filled]

// --- primitives -------------------------------------------------------------
#let badge(label, color: colors.primary) = box(
  fill: color, inset: (x: 6pt, y: 2pt), radius: 3pt, baseline: 2pt,
  text(size: 8pt, weight: 700, fill: white, label),
)

#let tag(label, color: colors.muted, variant: "outline") = {
  if variant == "solid" {
    box(fill: color, inset: (x: 5pt, y: 1.5pt), radius: 3pt, baseline: 2pt,
      text(size: 8pt, weight: 600, fill: white, label))
  } else {
    box(stroke: 0.6pt + color, fill: white, inset: (x: 5pt, y: 1.5pt), radius: 3pt, baseline: 2pt,
      text(size: 8pt, weight: 600, fill: color, label))
  }
}

// chip that works on any background (white fill, not transparent)
#let chip(txt) = box(
  fill: colors.bg-code, stroke: 0.4pt + colors.primary-light,
  inset: (x: 4pt, y: 1pt), radius: 2pt, baseline: 1pt,
  text(font: ("JetBrains Mono", "Menlo"), size: 8.5pt, fill: colors.ink-soft, txt),
)

#let callout(title: none, body, color: colors.primary, icon: none) = block(
  breakable: false,
  fill: color.lighten(82%),
  stroke: (left: 3pt + color),
  inset: (left: 12pt, right: 12pt, top: 10pt, bottom: 10pt),
  radius: (right: 4pt),
  width: 100%,
  {
    if title != none {
      stack(dir: ltr, spacing: 6pt,
        if icon != none { text(size: 10pt)[#icon] },
        text(weight: 700, fill: color.darken(25%), size: 9.8pt)[#title],
      )
      v(0.2em)
    }
    set text(size: 9.5pt, fill: colors.ink-soft)
    body
  },
)

#let panel(title: none, body, color: colors.primary, keep: true) = block(
  breakable: not keep,
  fill: colors.card,
  stroke: 0.6pt + colors.rule,
  inset: 12pt,
  radius: 6pt,
  width: 100%,
  {
    if title != none {
      text(weight: 700, size: 10pt, fill: color)[#title]
      v(0.3em)
      line(length: 100%, stroke: 0.4pt + colors.rule)
      v(0.3em)
    }
    body
  },
)

#let status(state, label: none) = {
  let map = (
    ok: (colors.success, "met"),
    partial: (colors.warning, "pending"),
    risk: (colors.danger, "risk"),
    info: (colors.primary, "info"),
    na: (colors.muted, "n/a"),
  )
  let (c, default-label) = map.at(state)
  let display = if label != none { label } else { default-label }
  stack(dir: ltr, spacing: 5pt,
    box(fill: c, radius: 100%, width: 8pt, height: 8pt, baseline: 1pt),
    text(size: 8.5pt, weight: 600, fill: c.darken(10%))[#display],
  )
}

#let price-bar(amount, max: 160, color: colors.primary) = box(
  width: 100%, height: 12pt, fill: colors.bg-code, radius: 2pt,
  align(left + horizon,
    box(
      width: calc.min(amount / max, 1.0) * 100%,
      height: 100%, fill: color, radius: 2pt,
    )
  ),
)

#let step-circle(n, color: colors.primary) = box(
  fill: color, radius: 100%, width: 20pt, height: 20pt, inset: 0pt,
  align(center + horizon, text(size: 10pt, weight: 700, fill: white)[#n]),
)

#let metric(value, unit: "", label: "", color: colors.primary) = stack(
  dir: ttb, spacing: 3pt,
  align(center, {
    text(size: 20pt, weight: 700, fill: color)[#value]
    if unit != "" {
      h(3pt)
      text(size: 11pt, weight: 600, fill: color)[#unit]
    }
  }),
  align(center, text(size: 8pt, fill: colors.muted)[#label]),
)

#let cite(n) = super(text(fill: colors.primary-dark, weight: 700, size: 7pt)[#n])

// --- diagram primitives -----------------------------------------------------
// user icon — stylized person glyph using circle (head) + rounded body
#let user-icon(color: colors.primary, size: 18pt) = box(
  width: size, height: size * 1.2,
  place(top + center,
    stack(dir: ttb, spacing: -1pt,
      box(fill: color, radius: 100%, width: size * 0.4, height: size * 0.4),
      box(fill: color, radius: (top: 100%, bottom: 3pt),
          width: size * 0.75, height: size * 0.55),
    ),
  ),
)

// stream icon — pill showing concurrent streaming
#let stream-icon(color: colors.secondary, size: 18pt) = box(
  fill: color.lighten(70%), stroke: 1pt + color,
  width: size * 1.8, height: size * 0.9, radius: 100%,
  align(center + horizon,
    text(size: size * 0.5, weight: 700, fill: color)[#sym.tilde.op]),
)

// GPU chip icon — square with inner stripes suggesting silicon
#let gpu-icon(color: colors.primary, size: 20pt, slot: 1) = box(
  fill: color.lighten(80%), stroke: 1pt + color,
  width: size, height: size, radius: 3pt,
  align(center + horizon,
    text(size: size * 0.5, weight: 800, fill: color)[GPU]),
)

// cloud wrapper — dashed rounded rect with a label
#let cloud-box(label, body, color: colors.primary) = block(
  fill: color.lighten(92%),
  stroke: (paint: color, thickness: 1pt, dash: "dashed"),
  radius: 8pt,
  inset: (x: 14pt, y: 10pt),
  width: 100%,
  {
    text(size: 8pt, weight: 700, fill: color)[#upper(label)]
    v(0.3em)
    body
  },
)

// arrow with label above
#let arrow-label(label, color: colors.primary) = stack(
  dir: ttb, spacing: 2pt,
  align(center, text(size: 7pt, fill: color, weight: 600)[#label]),
  align(center, text(size: 14pt, fill: color)[#sym.arrow.r]),
)
