# The design system

This app exists to put several plans side by side and let somebody decide.
Every rule below serves that or it is decoration.

This is a description of **this** codebase, not of an ideal. The tokens live in
`:root` in [`assets/css/app.css`](../assets/css/app.css) and the stylesheet is
the source of truth for their values; this file explains what each one is *for*.
When the two disagree, one of them is a bug — fix the code, or failing that fix
this file, and never leave them disagreeing.

Some of what is written here is held by tests. Those are collected at the end,
under [Pinned by tests](#pinned-by-tests).

---

## The tokens, at a glance

Everything is a custom property on `:root`, and there is no build step, so
`:root` *is* the token file. Six families:

| family | what it settles |
|---|---|
| surfaces and ink | `--plane`, `--surface-1`, `--surface-2`, `--text-primary`, `--text-secondary`, `--text-muted`, `--grid-line`, `--axis-line`, `--border`, `--border-strong`, `--shadow` |
| meaning | `--accent`, `--accent-solid`, five `--series-*`, four `--strategy-*`, two status, four `--origin-*` |
| type | nine `--type-*` steps |
| space | eleven `--space-*` steps |
| shape | `--radius`, `--radius-sm`, `--font` |
| layout | `--shell`, `--rail`, `--dock` |

Dark is the same names with different values, declared twice — once under
`@media (prefers-color-scheme: dark)` for the reader who never chose, and once
under `:root[data-theme="dark"]` for the reader who did. Only colour changes
between themes. Type, space, shape and layout are the same in both.

The three layout tokens are the unusual ones: they are *rewritten by the tier
ladder* rather than fixed, which is how one set of rules covers a 320px phone
and a 5,120px wall. See [The tier ladder](#the-tier-ladder).

---

## Colour, and what it is allowed to mean

The palette was searched in OKLCH space against a colour-vision-deficiency
validator, and every value carries its reasoning in a comment beside it. That
work is done. What this section is for is the constraint that keeps getting
quietly broken: **the palette is full.** There are no spare slots.

- **Five series colours.** On a flow card, colour means *which series* — income,
  expenses, net, invested, total. The first three are categorical slots 1–3 of
  the validated reference palette. The fourth and fifth had no documented slot
  that cleared the all-pairs floors beside them in dark mode, so each was found
  by searching against the validator; the comments record what they scored.
- **Four strategy colours.** In a comparison, colour means *which plan*. Four is
  not a UI budget — it is how many the palette can seat with every pair still
  distinguishable for a reader with CVD, in both themes. That is why
  `MAX_STRATEGIES` is 4 in [`strategies.js`](../assets/js/strategies.js), and
  the two numbers are the same number.
- **Two status colours**, good and critical. They never double as a series.
- **Four origin marks** — where a plan came from — deliberately *outside* the
  categorical palette and deliberately muted, drawn from the two bands the
  palette leaves empty plus an ochre far from the expenses orange. A vivid mark
  on a tab reads as a legend swatch saying which line in the chart the plan is.
  A low-chroma leading edge reads as chrome, which is what it is.

So a new meaning does not get a new colour. **It gets weight, position, a rule,
a shape, or words.** The app has done this repeatedly and it works:

- *What moves the needle* is a ranked list of bars rather than a sixth series,
  and the bars are drawn in `--text-muted` at 80% — a swing is a size, not a
  category.
- A target's rule on a chart is the muted ink, dashed, because a reference is
  not a category. So is the "paid in" line under an investment.
- *Where you are* — the active row of the comparison table, the current release
  in the About panel, the tab you are on — is a 3px strip of `--accent` inset
  from the left plus `aria-current`, never a tint. A 1.1:1 background tint is
  not a cue.
- A plan that arrived shared and has since been edited is the same teal a step
  deeper **and** broken into a dash, so the difference survives a reader who
  cannot tell two teals apart, and survives print and forced colours.

And **colour never carries meaning alone.** Every coloured mark is also named in
text: the chart legend appears whenever there are two or more series, every flow
card carries a direct end-label, every chart has a table view, the comparison
table repeats the strategy key beside the plan's name, and the field row's
colour stripe repeats what the direction select already says.

`--accent` means focus, a link, the brand and *where you are*. It is not
available for a quantitative encoding; lending it one is how a palette starts
drifting.

### Contrast, as the stylesheet states it

- `--accent` reaches only 4.42:1 on white, under AA for the text sizes it is
  used at, so solid controls that carry white text use `--accent-solid` instead.
- `--text-muted` reaches about 3.5:1 on the light surface. It stays where it is
  decorative — borders, the crosshair, a bar, a dashed rule — and text that
  needs to be read uses `--text-secondary`.
- Both steps of the origin teal clear 3:1 against the tab in both themes, which
  is the floor for a mark that is not text. The lighter step reached only 2.5:1,
  which is why the "edited" mark goes deeper rather than lighter in light mode
  and the other way in dark.
- Light aqua sits below 3:1 on the light surface, which is why every chart ships
  a direct end-label and a table view rather than relying on the line alone.

---

## The type scale

Nine steps. The file had thirteen sizes before this scale existed — 11, 11.5,
12, 12.5, 13, 13.5, 14, 14.5, 15, 16, 17, 22, 64 — and six of them were half a
pixel from another. Nobody chose that; it is what happens when each rule is
written beside the one it resembles.

| token | size | what wears it |
|---|---|---|
| `--type-3xs` | 11px | a mark inside a drawing: chart axis ticks, flow-diagram names on a phone, the month in a tooltip |
| `--type-2xs` | 12px | what annotates a figure: the derived line under a field, chart descriptions and captions, legends, end-labels, the footer, a plan's field count, the unit printed inside a box |
| `--type-xs` | 13px | secondary reading: hints, notes that open a disclosure, status chips, horizon presets, the ranked list, a table's body, the About panel's releases |
| `--type-sm` | 14px | what you press, scan or are told: buttons, tabs, section and card names, the section note under a heading, project rows |
| `--type-md` | 16px | the document, and **every box you type in** |
| `--type-lg` | 17px | the title over the one dialog |
| `--type-xl` | 22px | a summary tile's answer |
| `--type-2xl` | `clamp(40px, 8vw, 56px)` | the one figure the whole page is about |
| `--type-3xl` | 64px | the same figure, from 3,000px up, where 56 is a footnote |

**Why a 1px ladder and not a ratio.** A ratio at this end lands between pixels,
and this app is dense: every reading on the page is a figure beside a name, and
the names have to stack without fighting. The ratio starts above the body size,
where the figures are — 16 → 22 → 40/56 → 64.

**Why 16px is not a taste.** Under 16px a phone zooms the page in when a box
takes focus and does not zoom back out, leaving the reader panned somewhere they
did not ask to be. Every box you type in wears `--type-md` and nothing smaller —
including, under a coarse pointer, the strategy name box and the share link,
which are the two that had to be told.

**Why half-pixel steps went.** At 12–15px, half a pixel moves no glyph a reader
can see. What it does do is make two sizes that look identical impossible to
tell apart in a diff: `13.5px` in a new rule reads in review as a decision and
is almost never one. Each pair is one step now, **snapped down to the integer**,
so every collapse made text smaller or left it alone and nothing on the page
could newly outgrow its box.

**Why 15 went too.** A section's name is told from the prose under it by weight
(600 against 400), by `letter-spacing: -0.01em`, and by position. It was never
told by the pixel that used to be between them.

### Leading and weight

Three leadings, and they are in one place each: `1.5` on `body`, `1.25` on
`h1, h2, h3`, and `1.05` on `.hero-value`, where a display figure at 56px on
body leading would sit in a band half again its own height.

Five weights: `400` ordinary, `500` a label that names a control, `600` a name
or a figure, `650` the two display figures, `700` the row of the comparison you
are on. Weight is how hierarchy is carried once size has stopped carrying it.

---

## The spacing scale

Eleven steps: a 2px grid to 12, a 4px grid to 24, an 8px grid above.

| token | size | typical use |
|---|---|---|
| `--space-3xs` | 2px | a figure and its own label; a row of icon buttons |
| `--space-2xs` | 4px | inside a control; a title and the line under it |
| `--space-xs` | 6px | a swatch and its name; between pills |
| `--space-sm` | 8px | the common gap: a flex row of controls, a field row's parts |
| `--space-md` | 10px | a card's internal stack; a list of rows |
| `--space-lg` | 12px | a panel's head; the inline padding of a pill |
| `--space-xl` | 16px | between blocks inside a panel; a chart card's padding |
| `--space-2xl` | 20px | a panel's own padding; between panels and between grid columns |
| `--space-3xl` | 24px | the widest gap inside a row |
| `--space-4xl` | 32px | the footer's foot |
| `--space-5xl` | 40px | the page's foot |

The grid gets coarser as the distances get longer because that is the only range
in which a reader can see the difference: 2px between a label and its figure is a
relationship, and 2px between two panels is nothing at all.

**What the scale governs.** `gap`, and the `padding` and `margin` that hold
content off its own edges. Negative nudges are the same scale negated —
`calc(-1 * var(--space-3xs))` — because pulling a note 2px up under its control
is the same rhythm read backwards.

**What it does not govern.** Measurements. A control's height, the room reserved
for a unit printed inside a box, the height of the pinned bar, a track's
thickness, the widths in the tier ladder. Those are numbers somebody measured,
and rounding a measurement onto a ladder is how a measurement stops being true.
Seven measurements are left standing in the stylesheet, and each says why where
it stands:

| literal | why |
|---|---|
| `padding: 1px` on the three tab scrollers | a scrollport clips its children; without it a tab at the edge loses the outer pixel of its focus ring |
| `margin: -1px` on `.sr-only` | part of the visually-hidden idiom, not a distance |
| `padding-top: 48px` when the form is folded | the height of the pinned strategy bar |
| `padding: 13px 0` on a `<summary>` under a coarse pointer | 13 a side takes a 13px line to 45.5, the first whole pixel over the 44 floor |
| `padding-right: 62 / 56 / 54 / 46 / 40 / 30px` on a unit box | room measured for the words printed inside it, in the longer of the two languages |
| `padding-left: 46 / 36px` on a month box | the same, mirrored, for the word that leads |
| `calc(var(--space-lg) + 4px)` on a tab with an origin mark | the pill's own inline padding plus the 4 the inset shadow paints over |

Two more are arithmetic rather than literals: the marked release pulls itself out
by `calc(-1 * var(--space-lg))` and pays it back with
`calc(var(--space-lg) - 3px)` plus a 3px rule, so the text never moves.

---

## Shape

`--radius: 14px` is a surface — a panel, a chart card, a dialog, a callout box.
`--radius-sm: 9px` is a control or a box you type in. `999px` is a pill, which is
a shape rather than a size: tabs, presets, ghost buttons and the toast.

Two radii are deliberately not tokens. `:focus-visible` sets `border-radius: 4px`
because the focus ring is drawn on elements of every shape and needs a corner of
its own. The 1–2px radii on legend keys, row keys and the field row's colour
stripe are a mark's end-cap, which is half its own thickness and has nothing to
do with the surfaces.

`--shadow` is one two-layer shadow, used on every raised surface and nowhere
else, and it is the only shadow in the file. Depth is not a meaning here.

### Two switchers, two shapes

There are two switchers on one screen and they are not the same kind of control.
A strategy is switched constantly while you compare, so it is a row of pills you
can hit without aiming. A project is switched a handful of times a session, and
switching it replaces every plan, every target and the horizon at once, so it is
one button carrying the current name, and pressing it opens a sheet.

Colour cannot tell them apart — the palette is full, and a coloured mark up
beside the heading would read as a fifth legend swatch. **Shape does the work,
and the rule is worth stating on its own:**

- **A stadium is a peer you switch between.** Tabs, presets, ghost buttons.
- **A 9px box with a hairline is a control that takes a value**, and the form
  below is made of them — every input, every select.
- **A 9px box with a caret behind a divider is a control that opens a list.**
  It is the shape a `<select>` takes on every platform this app runs on, and the
  project switch is the only thing in the app that wears it.

So the project switch is a `--surface-1` box with a `--border-strong` hairline
and a `--radius-sm` corner — the chrome of the fields under it — with the name
ellipsised and the caret in a cell of its own, divided by a `--border` hairline
that runs the full height of the box (all 44px of it under a thumb). The caret
is a **solid 10px** triangle against the fold button's **stroked 20px** chevron
40px to its right: filled where that one is stroked, half its size, and in a
compartment where that one is bare. The two must never read as a pair, and that
sentence is older than this paragraph.

Before this, the resting state was 14px/600 near-black text on nothing with an
8px caret at `--text-muted` beside it, and a box that appeared on hover. It read
as a heading, because that is exactly what it looked like — and a reader cannot
hover what they have not noticed. Hover now confirms rather than announces: the
fill steps to `--surface-2` and the hairline to `--text-muted`, which is the step
an input takes under a pointer.

**The cue that clears the contrast floor is the caret, not the box.**
`--border-strong` on `--surface-1` is 1.49:1 in light and 1.90:1 in dark, under
the 3:1 this file names for a mark that is not text — but it is the same hairline
every input and select in the form wears, and making this one control's outline
darker than the boxes it sits above would say it was the emphatic thing on the
page. So the box is the family resemblance and the caret carries the meaning: a
solid triangle in `--text-secondary`, 7.73:1 light and 9.72:1 dark. If that
hairline is too faint it is too faint everywhere, which is a decision about the
form, not about this control.

**The box hangs 8px into the panel's padding and takes those 8px back as
measure.** The hang is so the *name* still starts on the column every label and
hint below it starts on; aligning the box edge instead would push the one word
that says which figures these are 8px right of everything under it. The
`max-width: calc(100% + var(--space-sm))` is the other half: the 8px is room the
button really has, and stopping at `100%` spends it on a wider gap to the fold
chevron instead of on the name. Measured on the upgrade store, where the switch
carries the panel's own heading — *What comes in and goes out* comes to 263.6px
in a 312px rail, which fits in the 268 this gives it and not in the 260 the
heading alone is.

What it cost: the control is **11px wider** (147.6 → 158.6 at 1440 in English,
195.4 → 206.4 in French). The panel head's height did not move at a single rung,
measured in both languages and in all three shelf states — one project named,
one unnamed, three:

| | 320 | 390 | 768 | 1024 | 1280–2560 | 3440–5120 |
|---|---|---|---|---|---|---|
| EN | 146 | 146 | 144 | 100 | 178 | 176 |
| FR | 146 | 146 | 186 | 144 | 178 | 218 |

**These are the numbers, and an earlier release note got them wrong.** The pull
request that introduced the type scale claimed the panel head was "identical to
v59 to the pixel" at 180 and 220. It was not: the scale moved 1280–2560 from 180
to 178, and at 3440 it took English from 220 to 176 — a whole line, because the
strategy tabs stopped wrapping once their text lost a pixel — while French, whose
names are longer, still wraps and reads 218. Measured across the releases: v59
and v61 give 180/220, and v62 onwards gives the table above. Nothing since has
moved them. If you are checking a layout against a remembered figure, check it
against this table instead, and measure the baseline you actually served.

No name truncates that did not truncate before, in either language, in any of
those states, and the gap to the fold chevron never falls below 12px — the
`--space-lg` the title row is laid out on.

**Pinned, the box comes off again.** In the bar at the top of the window the
switch stands in a row of controls, behind a rule, with the pills beside it, and
the row is the cue that nothing around a lone heading above a form can give. What
a box would cost there is width: the button is capped at `min(30vw, 220px)` and
full at every width below about 730px, so a border and a divided cell come
straight out of the name — 11 of the 117px a 390px phone gives it, which is the
difference between *Acheter u…* and *Achete…*. The name is the only thing saying
which question these plans answer, so it keeps the pixels. The caret is the same
mark in both places.

---

## Comparing plans

This is the part of the system that is load-bearing, because it is the thing the
app is for.

### How a plan is identified

A plan is identified by **its name, first and everywhere**. The name is what the
reader typed, it is a text box rather than a label when the plan is active, and
the active tab *is* that box — one name, one place on screen.

Colour is the second cue and never the first. `strategyColor(index)` hands out
`var(--strategy-1)` … `var(--strategy-4)` by position in the list, so a plan's
colour is stable across the comparison chart, the comparison table's row key and
the tooltip. Everywhere the colour appears, the name appears with it:

- In the comparison table, a 10×3px `.row-key` in the plan's colour sits inside
  the row header, *before* the name, and the header is sticky so scrolling the
  figures sideways never leaves a row anonymous.
- In the comparison chart, the legend is always present, because there are always
  at least two plans when the chart exists at all.
- In the tooltip, every row is key, name, figure.

Where you are is a third thing again, and it is drawn in `--accent`: an inset 3px
strip on the active row plus `aria-current="true"`, and `font-weight: 700`.

**Where a plan came from** is a fourth thing, and it deliberately looks like none
of the others — a 4px inset shadow on the leading edge of the tab, in one of the
four muted `--origin-*` marks, curved into a crescent by the pill's own radius so
it reads as an edge of the tab rather than a swatch beside it.

### How a series is identified

On a flow card, colour means which series, from the five `--series-*`. A flow
card is one plan in depth; a comparison card is one metric across plans. They
never share an axis and they never share a card, which is what stops the two
meanings of colour from ever being on screen in the same drawing.

### Why four is the ceiling

Four is how many the palette can seat with every pair distinguishable in both
themes for a reader with CVD. If a change seems to need a fifth, it needs a
different design — say so rather than adding a colour.

### How the comparison table and the flow cards divide the work

They answer different questions and the split is deliberate:

- **The flow cards** are one plan, several series, over time. They are small
  multiples: one shared scale, the same reserved end-label width across siblings,
  the same 220px plot height at every width. That is what makes the shapes
  comparable to each other rather than to their own axes.
- **The comparison table** is several plans, several metrics, at the horizon —
  one number each, no time axis. It is the only reading in the app that puts
  every plan's every total in one place, and it carries the gap column, which is
  the question "how much better, and than what": judged on the total rather than
  the net, because a plan that puts everything into an investment keeps less cash
  and would read as behind while being ahead.
- **The comparison chart** is one metric, several plans, over time — the table's
  middle column drawn. From 4220 up the two stand side by side, because they are
  the same ten figures drawn and written, and read together you can put a finger
  on a line and read its row. Below that the table is always a scroll under the
  chart it explains.
- **The ranking** — *what moves the needle* — is one plan, many fields, one
  quantity: a list of bars with no colour of its own at all.

The comparison table is the app's one **hard width requirement**: with four plans
it stops scrolling sideways at 1,076px in English and **1,160px in French**,
measured. Every layout decision about the dock is sized on the French number,
because sizing it on the English one would ship a dock that fixes the scroll in
one language and moves it in the other.

---

## A shelf that grows

The projects sheet holds two lists. One is bounded — six projects, and at six
the template shelf goes away entirely rather than sitting there greyed. The
other grows by a row every time the app learns a new subject, and that is the
one with a layout problem in it.

Measured at 320×720 with two templates: the sheet came to 836px in French inside
a 518px box, the shelf alone to 521, and the second template's button sat below
the fold with the project list above it. A reader on the smallest phone the app
supports saw one template and nothing to suggest there was another.

**It scrolls, and that is the right answer.** Each template carries a paragraph
saying what is in it, and that paragraph has to be readable *before* the button
is pressed — a figure claimed to be an example only after you have pressed is
worse than no claim — so it is never behind a disclosure at any width. Three
such paragraphs do not fit on a 320px phone at any size worth reading, and
shrinking them to make them fit would spend the one thing the shelf is careful
about. What was broken was never the scroll. It was that nothing said the list
continued.

So the shelf is built to **read as a list of n** rather than to fit:

- **The lead counts them.** "Or start from one of 3 templates", in the same shape
  the project switch's own label counts plans. It is the only cue that survives
  the fold, it scales to any number, and it costs no height at all.
- **The claim is said once**, in the shelf's head, above every button — not at
  the end of every note, where it was word for word the same sentence and where
  a reader has already stopped. Hoisted, it is read before anything can be
  pressed, which is the whole of what it was for.
- **A hairline between rows**, in `--grid-line` rather than the `--border` that
  opens the shelf: that one says "a new section", this one says "another of the
  same". A rule arriving at the bottom edge of the sheet is itself a "there is
  more below"; ten pixels of nothing never was.
- **The sheet takes 88vh**, where the About panel and the shared-plan dialog take
  72. Both numbers are measured. 72 is desktop-dialog sizing and left 101px of
  dimmed page above and below on a 720px-tall phone while the sheet was 318px
  too long; 88 leaves 43px, which still plainly reads as a card over a page. What it
  spends is backdrop to dismiss by tapping — the Close button is the real exit
  and is 44px under a thumb.
- **Its cap is 900px, not the About panel's 720.** That cap is for a changelog
  with no end to it; this sheet's content is bounded. Measured at the 560px the
  dialog is wide, two templates and one project come to 576, a third takes that
  to 731 and two projects with three templates to 791. 720 would put the sheet
  on a scroll the day a third template lands, on a desktop. The cap never bites
  below an 1,023px-tall window, where 88vh is the smaller of the two.

What this buys, measured at 320×720 with two templates: both buttons inside the
visible box in both languages, the second ending at 592 of 632 in English and
612 of 632 in French. What it does not buy is a third — at 320 the third button
lands at 825 (EN) and 844 (FR), and at 390 it peeks. **That is the design, not a
shortfall:** past two templates the shelf is a list you scroll, and the lead is
what tells you so.

The type steps are worth naming, because the temptation here is the wrong one.
The lead is `--type-xs` at weight 600, the same shape the About panel's
sub-headings take — told from the prose under it by weight and position, not by
a size of its own. The claim stays at `--type-xs` with the rest of the reading
and is deliberately *not* stepped down to `--type-2xs` on a phone: it would have
saved about 4px, and it is the one sentence that has to be read.

---

## The tier ladder

Twelve `min-width` rungs and four `max-width` ones. The shell grows **in order to
seat columns**, and stops the moment there is no further column worth seating:
measured at 1440, every section in the readings is already at its full height by
the time the column is 986px wide and stays there to 7680, so width on its own
buys 60px of page — 1.8%. What buys page height is how many things stand beside
each other.

Every number below was measured in a browser against the plan the app ships
with, one pixel either side of the rung. `column` is the reading column and
`page` is `document.scrollHeight` at a 900px-tall window.

| rung | what it buys | measured, at rung−1 → rung |
|---|---|---|
| **720** | four flow cards go 2×2 rather than 3-and-a-lonely-fourth | the rule holds 2 across until 1830; without it `auto-fit` seats 3 at 349px from a 1,080px column and 4 at 330px from 1,367 |
| **1180** | the form stands beside the readings instead of above them | shell 1120 → 1400, `--rail` takes effect at 354, the readings drop 1080 → 766, page 4056 → 3283 |
| **1600** | the readings finally clear the comparison table | shell → `min(2600px, 100vw − 48px)`, column 986 → 1138 — the first reading column wide enough for four plans without a sideways scroll. Also where the measure caps land (68ch on always-visible prose, 72ch inside disclosures) and where the ranked list is capped at 820 from 986 |
| **1830** | four cards go four across | 2 across at 675.5px → 4 at 330px, page 3186 → 2818 |
| **2720** | **nothing** — see below | no change in any state its selectors name |
| **3000** | the comparison dock stands up as a third column | shell → `min(3400px, …)`, `--dock` 0 → 1180, the readings drop 2186 → 1338, page 2818 → 1839 |
| **3060** | five cards go five across with the form folded | 3 across at 555.7px → 5 at 327.2px, in a 1,700px column |
| **3300** | the rail widens so the form stops being in phone mode | rail 354 → 620, column 1637 → 1372; the panel's content box crosses the 558px container threshold and the plan switcher stops scrolling sideways |
| **3370** | five across with the comparison away or ranking only | 3 across at 589.7px → 5 at 347.6px, in an 1,802px column |
| **3560** | the targets and the flow diagram come up side by side | the readings split `1fr / 1.6fr`, flow diagram 1200 → 923.1, page 1840 → 1591 |
| **4220** | the dock takes the comparison chart beside its table | shell → `min(4400px, …)`, dock 1180 → 1940, `#compare` → `1fr / 1160px` |
| **4352** | five across with the comparison docked | 3 across at 543.7px → 5 at 320px, in a 1,664px column |

And the four narrow ones, which are `max-width` and so apply *at* the number:

| rung | what it does |
|---|---|
| **640** | the strategy tabs become a sideways scroller instead of wrapping onto three full-width lines; the unit inside a rate box says `%` rather than `% a year` |
| **420** | the ranked row drops to two columns, the name on its own line |
| **380** | the page and header margins come down from 20 to 12, and the padding of a panel *and of a dialog* from 20 to 16 — a dialog is a surface like a panel and had been left out of this rung. The eight pixels it gives back are eight of measure, and measure is what decides how many lines a paragraph takes: in French the first template's note falls from 137px to 117px, a whole line, and the sheet's content comes down 28px in English and 27 in French. The dialog's own height does not move, because it is at its cap either way. **The rule sits beside `.about` rather than in this block**, and has to: `.about`'s padding is declared *after* the block, so the copy that first shipped inside it lost the cascade and did nothing — computed padding stayed 20px at 320. If you move it back up here, measure it before you believe it. |
| **358** | a field's head wraps: the name takes the line and the amount and the toggle share the next |

### The two floors the whole ladder is built on

1. **The comparison table wants 1,160px** with four plans in French. That is why
   the dock starts at 1,180 and not anywhere narrower.
2. **A flow card wants about 320px** before `chart.js` starts dropping its
   end-labels, and about 560 before the plot goes flat — the plot is 220px tall
   at every width there has ever been. Cards are counted against those two
   numbers, not eyeballed. Measured on the rung that got this wrong once: at 3369
   three across at 470px with 6 of 6 labels, at 3370 five across at 275.6px with
   0 of 6.

### 2720 is inert

Its two rules restate what `@media (min-width: 1600px) and (max-width: 2999px)`
already says below 3000 and what `@media (min-width: 3000px) and
(max-width: 4219px)` already says above it, and the 3060 rule that follows it
wins where they would differ. Measured in both states its selectors name
(`data-rail="closed"` with four cards and with five): **no change at 2719 → 2720**.

It is left in place rather than removed. The `max-width: 2999px` /
`min-width: 3000px` pair leaves a gap at fractional viewport widths — a browser
at a zoom level that computes 2999.5px matches neither — and the 2720 block is
currently the only thing covering that sliver for a folded rail. Removing it
would widen a hole that already exists for an open one. The honest fix is to make
every `max-width` in the ladder `…99.98px`, which is a change to twelve rungs and
wants its own pass with its own measurements.

### Two mechanisms, on purpose

The form's narrow layout is written **twice**: once as `@media (max-width: 640px)`
and `@media (max-width: 358px)`, and once as `@container inputs (max-width: 558px)`
and `@container inputs (max-width: 300px)`.

This is not duplication to be tidied away. Container queries want Chrome 105 /
Firefox 110 / Safari 16 and this app's floor is Chrome 88 / Firefox 98 /
Safari 15.4, so the media queries are the floor-safe baseline a real phone must
keep and the container twins are for the one case a width query cannot see: a
narrow column of form on a wide screen, which is what the panel becomes when it
is docked as a rail (312px of content box inside a 354px rail). They never fight
— a phone is never inside a wide container, and a 312px rail is never inside a
640px window. **Do not fold one into the other.**

558 is what the panel's content box measures inside a 640px window and 300 is
what it measures inside a 358px one, both measured, so every window keeps exactly
the layout it had.

### The coarse-pointer block

`@media (pointer: coarse)` is **the last at-rule in the file** and every new touch
size goes inside it. A media query adds no specificity, so a rule filed after it
with the same specificity wins — and a thumb gets a 36px target with the
stylesheet still saying 44 a few lines up. That is the failure mode: not an
error, just a control that is quietly too small on exactly the devices the block
exists for.

Keyed on the pointer rather than the width, because a phone held in landscape is
still a phone and a touchscreen laptop is still touched. Nothing in it changes
what the app looks like under a mouse.

---

## Accessibility invariants

**44px under a thumb.** Every control the app offers is comfortable at 36 or 40px
under a mouse and a nuisance under one; on a coarse pointer they all reach 44,
the figure both Apple and Android publish. A `<summary>` is the hardest case —
28px of text and nothing else — and it takes padding rather than a height,
because a `<summary>` made a flex box loses the disclosure triangle the browser
draws for it.

**16px in anything you type in.** See [the type scale](#the-type-scale).

**Colour is never the only cue.** Restated in full under
[Colour](#colour-and-what-it-is-allowed-to-mean); it is the invariant most often
broken by accident.

**Nothing scrolls sideways.** `document.scrollWidth` must equal `clientWidth` at
every width, in both languages. Two rules do most of the work: **no bare `1fr` in
`grid-template-columns`** — always `minmax(0, 1fr)`, because a grid item's
default `min-width: auto` is min-content and one long field name then pushes the
page sideways — and **anything holding a name gets an explicit `min-width: 0`**,
which is the same thing said about flex. The comparison table is the one
deliberate exception: it scrolls inside its own box, with its row headers sticky
so a row is never anonymous.

**Nothing is laid out where no amount of scrolling reaches it.** The rail is
capped at the height of the window and holds two panels, so its first row must be
allowed to shrink and its second must be capped — written `auto`, a 641px window
with the assumptions open gave the fields 134px under a 180px sticky head, and
every row was pinned beneath it. The dock is the other half of the same idea and
goes the other way: it is never a scrollport and never sticky, because a reading
that has to be scrolled out from behind its own edge is worse than one that
scrolls with the page. Measured before it was taken out: 97px of the ranking
hidden on a 3440×900 screen, 277px on a 2560×720 one.

**Both languages are equal.** Every string goes in both dictionaries, French
takes a no-break space before `: ; ? !` and `%` and inside `« »`, and every
layout is tested in French too — it is reliably the longer language and it is
where the overflow shows up first.

**The focus ring is 2px of `--accent` at 2px offset**, on a 4px corner, and it is
never removed. `:focus-visible` rather than `:focus`, so a mouse press does not
draw one.

**Motion is opt-out.** `@media (prefers-reduced-motion: reduce)` takes every
transition and animation to 1ms.

---

## Pinned by tests

These are held by `npm test` rather than by somebody remembering. Breaking one
fails the build, and working around the test is never the answer.

From [`test/design-system.test.mjs`](../test/design-system.test.mjs):

1. Every `font-size` outside `:root` is `var(--type-…)`, naming a step `:root`
   actually declares.
2. Every `gap`, `row-gap` and `column-gap` outside `:root` is built only from
   `var(--space-…)`, naming steps `:root` actually declares.
3. Neither scale carries a step nothing wears — a scale that only grows is a set
   of near-duplicates again in a few releases.

From [`test/layout.test.mjs`](../test/layout.test.mjs):

4. `@media (pointer: coarse)` is the last at-rule in the stylesheet.
5. Every rule that gives `main` its columns floors the reading column at
   `minmax(0, 1fr)`, and `.output > *` opts out of `min-width: auto`.
6. Every rule that gives `main` its columns has a `[data-rail="closed"]`
   counterpart filed no earlier in the file, or folding the form turns a chevron
   and changes nothing.
7. The rail's first row is `minmax(0, 1fr)` and its second is capped as a
   percentage, and the assumptions scroll past that cap.
8. The strategy switcher stays outside the part of the form that folds.
9. The assumptions stay outside the panel a strategy switcher names — they are
   siblings of `strategies` in the state, and a comparison read on different
   terms would mean nothing.
10. The fold button names what it folds and ships saying which way it is.
11. Every kind of `<details>` in the markup has a coarse-pointer rule for its
    summary.
12. The dock never sets `overflow`, `overflow-y`, `max-height` or
    `position: sticky`.
13. Every `[data-dock="…"]` state the stylesheet lays out is one `app.js` writes,
    and every state it writes is one the stylesheet lays out.
14. A five-across rule below 4352 excludes the docked state.
15. The fold only reserves room for the pinned bar where that bar can exist —
    which is to say, where there is more than one plan.
16. The project switch never wears the pill's radius, and the caret keeps the
    cell that tells a list from a button — see
    [Two switchers, two shapes](#two-switchers-two-shapes).

Elsewhere: `test/docs.test.mjs` holds `CONTRIBUTING.md`'s Layout block to the
files the project actually ships, and `test/about.test.mjs` holds the changelog
to having an entry for the running build and to the French spacing rule.
`test/templates.test.mjs` holds the two rules that keep
[the template shelf](#a-shelf-that-grows) readable as it grows: no template's
note repeats the claim the shelf's head already makes, and the lead that counts
the templates actually names the number it is given, in both languages.

---

## Adding something

1. **Does it need a colour?** Almost certainly not — see
   [Colour](#colour-and-what-it-is-allowed-to-mean). Reach for weight, position,
   a rule, a shape or words first.
2. **Pick a type step by what the thing *is***, not by what looks right: is it a
   mark inside a drawing, an annotation on a figure, secondary reading, something
   you press, the document, or a figure? There are nine answers and the token
   names which you gave. If none fits, that is worth a conversation before it is
   worth a tenth step.
3. **Pick a spacing step the same way.** If the distance is a *measurement* —
   room for text printed inside a box, a control's height, the height of
   something that overlays — it is not a step; write the number and say why.
4. **Give every container down to the row an explicit `min-width: 0`**, and never
   write a bare `1fr`.
5. **Write both languages**, and open the layout in French.
6. **If it is a new pattern, write it down here in the same change.** A pattern
   that ships without its entry is drift by the next session.
7. **Bump `CACHE_VERSION` in `sw.js` and run `npm run stamp`.**
8. **Measure, then say it.** Serve with `PORT=<port> node tools/serve.mjs` and
   drive a browser over 320, 390, 768, 1024, 1280, 1440, 1920, 2560, 3440 and
   5120 in both languages, plus a short viewport (1280×720) and a `hasTouch`
   pass. A number without its baseline is not evidence.
