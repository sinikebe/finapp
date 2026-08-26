# Finapp

A small progressive web app that estimates your financial future. List what
comes in and what goes out each month, choose a horizon, and it plots three
cumulative curves — income, expenses and net — over the months ahead, plus what
you are worth in total once there is a balance sheet to speak of. Lay out more
than one plan and it puts them side by side.

Everything runs on the device. No build step, no dependencies, no network, no
account. The whole app is static files served from a folder.

*Interface disponible en français : l'application détecte la langue du
navigateur et le bouton **FR / EN** dans l'en-tête permet d'en changer à tout
moment.*

## Run it

```sh
npm start          # static server on http://127.0.0.1:4173
npm test           # unit tests for the models, the projection, the scales
npm run icons      # regenerate the icon set from tools/generate-icons.mjs
```

A service worker only registers over `http(s)`, so open the app through the dev
server rather than as a `file://` URL. Any static host works for deployment —
copy the repository contents as-is.

## Fields

**Everything you enter is a field, and every field is the same kind of thing.**
Income and rent are simply the two the app starts with — not special cases, not
privileged code paths. Any field can be renamed, switched between income and
expense, duplicated or deleted, the starting two included. Nothing in the app
reaches for a field by name.

A field is defined once, in [`assets/js/fields.js`](assets/js/fields.js):

```js
{
  id,               // stable, generated
  labelKey,         // dictionary key, while you haven't renamed it
  label,            // your own name; wins over labelKey when set
  direction,        // 'income' | 'expense' — the direction carries the sign
  amount,           // as typed; the projection coerces it to money
  periodMonths,     // 1 monthly · 3 quarterly · 6 half-yearly · 12 yearly
  kind,             // 'plain' | 'once' | 'loan' | 'investment' | 'asset'
  annualRate,       // % a year: interest, return, appreciation, or a climb
  termMonths,       // how long a loan runs
  startMonth,       // first month it can land; 0 means from the beginning
  endMonth,         // last month it can land; 0 means no end
  synced,           // whether every strategy holds this same field
}
```

Three details that matter later. **The direction carries the sign**, so amounts
are always positive and no field can smuggle in a negative. **A field keeps its
`labelKey` after you rename it**, so clearing the name box hands it back its
translated default rather than leaving it nameless. And **a period is a count of
months, not a name**, so the projection can do arithmetic with it and a new one
— every two years, say — is a number in `PERIODS` plus a dictionary entry.

### What a field can be

- **Amount** — the default. It lands every period, unchanged unless you give
  it a rate, in which case it climbs by that much a year.
- **One-off** — it happens in one month and is done: a car, a deposit, a
  bonus. Its month is the only timing it has.
- **Loan** — you enter **the amount you need**, any fees the lender adds to it,
  the yearly interest rate and the number of monthly payments; the app works
  out the level repayment (the standard amortisation formula) and charges it
  every month until the term runs out. **The interest is added to what you
  entered, never taken out of it**: ask for 100,000 and you owe 100,000, repay
  127,279.20 over ten years at 5%, and the row says both figures. A loan points
  either way: outgoing when you repay one, incoming when you are repaid.
- **Investment** — you enter what goes in, how often, and the yearly return, and
  the month it is **sold**, if it is. Selling turns the balance into money in
  your account and ends the holding; it never creates anything, so what you are
  worth does not move on the day of the sale — that is the test. The gain stays
  a gain in the profit tile afterwards: it did not stop having happened.
  Otherwise a plan that sells its fund to buy a flat would have to spend the
  money and still be holding it.
  The contributions leave your cash like any other outgoing, and the balance
  compounds monthly: growth first, then the month's contribution, because money
  paid in today has not had time to earn yet. Each balance is tracked
  separately, so two investments can carry different rates.

- **Something you own** — a flat, a car, anything with a value. It moves no
  cash in any month: it simply is worth what it is worth, and gains at whatever
  rate you give it. It exists so that a loan has something to be set against.
  It takes the month you **come to own it** — empty means you already do — so a
  plan that buys in twelve years is not worth a house today. It takes no end:
  you do not stop owning a thing.

Three invariants belong to the model rather than the form, so a hand-edited
store can't break them: an investment is always money going out, a loan always
repays monthly whatever period is stored against it, and something you own has
neither a direction nor a period, because it never lands.

#### A loan is clear the month it is paid off

Being able to outlast a long loan turned up a disagreement that had always been
there and had never been reachable: `project()` walked the amortisation one
month further than `outstandingOf` did, so at exactly the last month of the term
a twenty-five-year mortgage still showed 2.69 owed — the last month's rounding,
left behind. The balance is cleared by construction once the term's payments are
made, and both now say so outright on the same month. A test walks every month
of three different loans and asserts the two agree on all of them, because two
ways of computing the same balance is exactly the kind of thing that drifts.

#### What you need, not what the bank lends

The amount on a loan is what you want **in hand**. Fees are entered beside it
and added on top, because that is the direction the arithmetic actually runs in:
a reader who needs 200,000 knows the 200,000, and it is the bank that decides
what has to be borrowed to hand it over. Asking for the total instead makes them
solve for it — enter 200,000, read the fees off the offer, add them, retype
203,000 — and get it subtly wrong every time the fee changes.

So the fees are lent along with the loan: you receive 200,000, you owe 203,000,
and every repayment amortises the larger sum. `borrowedOf(field)` is the one
place that decides it, and everything that repays, amortises or is owed reads
from there rather than from the amount. The fees are not interest and the row
does not call them that: a 0% loan with fees still costs exactly its fees.

The row says all of it in one line, and says it in the right direction. It used
to end "27,279.20 of that is interest", where *that* attached to the amount just
typed and read as though the interest came out of the 100,000 rather than being
added to it. It now names the total repaid outright — "27,279.20 of interest on
top, 127,279.20 repaid in all" — because a figure that can be read two ways in a
money app is a figure that will be.

Fees default to none, so every loan written before they existed borrows exactly
its amount — nothing already stored changes meaning. The two ways of saying the
same loan agree in every figure, which is what makes this a change to what you
type rather than to what it means: 200,000 needed with 3,000 of fees and a flat
203,000 produce identical repayments, identical debt and identical worth. A test
asserts that on the whole projection, point by point.

### An amount that climbs

A salary rises, a rent is indexed, a subscription creeps up. Give a plain amount
a **rate a year** and it climbs by that much — and the rate slot it uses is the
one every field has carried since loans arrived.

**That slot means something different for each kind, which is the one trap
here.** On a loan it is interest, on an investment the return, on something you
own its appreciation, and on a plain amount what it does to itself. Letting the
growth rule fall through to investments would have paid in more every year
because the market did well; the tests caught exactly that, and `contributionOf`
now says `if (field.kind !== 'plain')` in as many words. A one-off is the one
kind with no rate at all — it has no years to climb over.

**It steps on the anniversary, not a little each month.** A raise arrives once a
year, and compounding it monthly would be tidier arithmetic describing nobody's
pay. The count runs from the first month the amount could land, not from month
0, because a salary starting today pays twelve times before its first
anniversary — so the raise belongs in month 13. Put the other way round: **the
first time an amount lands it lands at what you typed**, and a year later it has
climbed once. That holds whatever its period, so a yearly bill behaves the same
way its monthly neighbour does.

The row spells out where it gets to, as far as the horizon on screen — a number
that moves with the slider, which is the point of putting it there. And because
*In today's money* is a separate switch, a 3% raise under 2% inflation can be
read as the 1% it really is.

### When it runs

Every field that moves cash carries a window: **from month** and **to month**,
both empty by default, which is what every field written before windows existed
reads as — from the beginning, with no end. Months are counted from today, which
is month 0.

Three details, each chosen so nothing already stored changes meaning:

- **A period counts from the start.** A yearly amount beginning in month 3 lands
  in months 3, 15, 27, not on some calendar nobody set. With no start of its own
  the count runs from month 0, which is exactly `month % period === 0` — the
  rule as it was before.
- **A loan's term is its end**, so it has a start and no end box. A start moves
  the *whole* loan: the money arrives the month before the first payment, so a
  mortgage you plan to take next year is not a debt you carry today, and the
  total worth says so.
- **An end before the beginning** is read as "it starts and stops in the same
  month" rather than landing nothing and explaining nothing.

A one-off is the degenerate window — one month — but it is its own kind rather
than something you assemble, because "a car, in month 18" is a thing people
mean, and making them derive it from `from = to` would be a puzzle.

### How often an amount lands

A field lands at the end of each of its periods: a yearly amount at months 12,
24, 36; a quarterly one at 3, 6, 9. The projection shows money moving when it
actually moves, so a lumpy year reads as a staircase rather than a smooth line
that never matches anyone's bank balance — and a total is the amount times the
number of times it actually landed, never a part-payment.

Because of that there is no single "per month" figure once a yearly bill is in
the list, so the summary reports the **average over the horizon**. With only
monthly fields that average is exactly the monthly figure, so nothing reads
differently until you give something a longer period.

## What it opens on

An empty form answers nothing, so the app opens on one question asked three
ways: **how should I buy a 100,000 house?**

1. **Buy now, on a loan** — 100,000 over twenty years at 3%.
2. **Save up, buy cash** — rent, save, and buy the month the savings cover it.
3. **Save up, sell the fund** — the same, but the index fund is cashed in too,
   which buys the house sixteen months sooner.

All three spend **exactly the same on housing every month**: the loan's
repayment of 554.60. The renters pay 500 of rent and invest the other 54.60 at
6%, so no plan is quietly saving more than another — the only thing being
compared is *when you own the house*. Pay and everyday costs are one field the
three of them share, because your salary does not change with how you buy.

And once a plan's housing is paid for, that 554.60 goes **back into the fund**,
less the property tax that replaces it — in every plan, from the month that plan
stops paying: the month after the last rent for the renters, the month after the
last repayment for the borrower. Without it the comparison would quietly become
one about what people do with spare cash rather than about when they bought.

The lesson is not the one an empty form would teach, and it is not a single
lesson either. Over twenty years borrowing wins by about 30,000 — not because
loans are free, the interest is 33,104, but because it owns an appreciating
house eleven years earlier. **Slide the horizon out and the answer reverses**:
by forty years the renters are ahead by more than 100,000, because they have
been compounding at 6% since year thirteen while the house appreciates at 1.5%
and the borrower only starts investing in year twenty-one. Not selling the fund
edges out selling it over that distance, for the same reason — the money kept
compounding instead of buying a house sixteen months sooner.

**The months the renters buy are computed, not chosen.** Nothing in this model
is conditional: "as soon as savings reach 100,000" cannot be written down, so
the month was worked out from these very figures and hard-coded. A test
recomputes both months and fails if a figure moves without them following,
which is the only way a written-down answer stays honest. Two details are
there for the same reason: the borrower owns the house from month 0, because
that is when the loan's money arrives — start it a month later and the plan
opens owing 100,000 for a house it does not own — and the property tax is
billed six months after the keys, because a buyer who has just spent everything
cannot pay a bill the same month.

None of this touches a plan you have already made: the defaults are only
consulted when there is nothing stored — and **Start again**, in the About
panel, puts them back when you want them.

It asks first. It is the one action in the app that throws something away, so
it takes two deliberate clicks and the second is labelled *Replace everything*
rather than *OK*; focus lands on keeping what you have, so a stray Return does
the safe thing, and the question is asked from scratch each time the panel
opens, since a confirm left standing from last time is one a stray click
answers. It writes the store at once rather than through the usual quarter-second
debounce: this is the one edit where a tab closed a moment later must not leave
the old plans in storage and the new ones on screen.

Both the first load and the reset read from one `defaultState()`, so the button
is guaranteed to land you exactly where a new reader lands rather than
approximately. Your **language and theme are left alone** — they are
preferences about reading the app, not part of the plan, and they live under
their own keys.

## Strategies

A strategy is a named set of fields — *what I do now*, *if I buy the flat*, *if
the raise goes into the index fund*. Strategies share one horizon, so their
curves can be read against each other, and share nothing else: each carries its
own fields, and editing one never touches another.

The app always holds at least one, and a reader who never compares anything
never meets the idea — a lone strategy is unnamed, its tab shows its position,
and the comparison view stays hidden until there is a second one to compare
against. **Add a strategy** duplicates the one you are looking at, because the
question is nearly always *what if I changed this one thing*, not *what if I
started from nothing*.

**Four is the ceiling, and the reason is the palette rather than the model.**
Four is how many series colours stay distinguishable in every pair — for a
reader with colour-vision deficiency, in both themes. A fifth would have to be
told apart by name alone, which is not a chart.
[`assets/js/strategies.js`](assets/js/strategies.js) is where that number lives,
next to the operations — add, rename, duplicate, remove — which are pure and
return new lists, like the field ones.

The switch sits at the top of the form, which is several screens away by the
time you are reading a chart — so a second one pins itself to the top of the
window once the first has scrolled off. It carries names and nothing else:
renaming, adding and removing stay in one place, because two boxes claiming to
hold the same name is exactly the confusion the active tab *being* the name box
was meant to avoid. It shows itself only when there is more than one strategy
and only while the real bar is off screen, so the two are never both asking to
be told apart. It is fixed rather than sticky, which sounds like a detail and is
not: a sticky element keeps its place in the flow, so revealing one while the
reader is halfway down the page shoves everything they are looking at down by
its height. And because four long names overflow a phone, the row scrolls
itself — never the page — to keep the name you are on in view.

### Fields two strategies share

A comparison only tells you something if the two plans differ in **one** place.
Your income does not change because you decided to invest — so a field can be
**synced**, and then it is one field that every strategy holds. Change it
anywhere and it changes everywhere: the amount, the name, the kind, all of it.

The link button appears on each row only while there is more than one strategy,
because with one plan there is nothing to keep in step.

How a counterpart is found is the whole design:

- **By id first.** A synced field keeps its id when a strategy is duplicated,
  which is the one place `duplicateStrategy` deliberately does not renew one.
- **By name second, and only at the moment you sync it.** Two lists that both
  say "Income" mean the same income — that is what makes this work on
  strategies built before anyone thought to link them. After the first spread
  their ids agree, so the name is never consulted again and a rename cannot
  break the link. A field already following something else is never adopted, and
  a field nobody has named has no name to match on.
- **By likeness last, for a field nobody named.** Its counterpart is a row alike
  in every respect but the id — which is what a field and the copy "Add a
  strategy" made of it are, a copy's unsynced fields getting ids of their own.
  Writing over such a row loses nothing of theirs, because it held nothing of
  its own.
- **Otherwise it is added.** A synced field exists everywhere by definition.

Two consequences worth stating outright. Removing a synced field removes it
from every strategy, because it is one field — unsync it first to drop it from
one plan only. And a duplicate is never born synced: two synced fields sharing
one identity would not be two fields.

### Side by side

Once there is a second strategy, a chart below the flow cards draws them all on
one scale, with a switch for what is being compared: net, in, out, and — once
any strategy holds an investment — the total and the investment balance.
Beneath it a table gives each strategy's totals and its gap to the first, which
is the number the comparison is usually for.

**That gap is measured on the total, not the net**, and the chart opens on the
same quantity until the reader picks another. A strategy that pours everything
into an index fund keeps almost no cash, so judging it on net would announce it
as behind directly above a chart agreeing — while it is, in fact, well ahead.
With nothing invested the two are equal to the cent, so nothing moves.

**In that view colour means strategy, not series.** The flow cards keep their
own meaning of colour because they never mix strategies; the comparison chart
never mixes metrics. Neither asks colour to carry two things at once.

## What it computes

The model lives in [`assets/js/projection.js`](assets/js/projection.js) and is
deliberately the simplest thing that is honest:

```
contribution(f, m) = before f.startMonth, or after f.endMonth → 0
                     once      → m === f.startMonth ? f.amount : 0
                     loan      → m within term of its first payment ? payment(f) : 0
                     otherwise → (m − f.startMonth) % f.periodMonths === 0 ? f.amount : 0
income(m)          = income(m−1)   + Σ contribution(income fields, m)
expenses(m)        = expenses(m−1) + Σ contribution(expense fields, m)
net(m)             = income(m) − expenses(m)
invested(m)        = Σ over investments of
                       balance(f, m−1) × (1 + f.annualRate/12) + contribution(f, m)
contributed(m)     = Σ paid into investments so far
profit(m)          = gain > 0 ? gain × (1 − tax) : gain,  gain = invested − contributed
owned(m)           = Σ assets, each gaining at its own rate
                     + principal still outstanding on loans owed *to* you
debt(m)            = principal still outstanding on loans you are repaying
worth(m)           = net(m) + invested(m) + owned(m) − debt(m)
```

for `m = 0 … X`, where month 0 is today — nothing earned, nothing paid.

**`worth` is the bottom line: the whole balance sheet.** Adding the balances
back is a sum rather than double-counting, because money put into an investment
has already left `net` as an outgoing — the two halves never hold the same coin
at the same time. With nothing invested, owned or owed it equals `net` to the
cent, which is why the app only shows it once there is something to say: a card
and a tile that restate the ones beside them are questions nobody asked.

The flows start at zero because nothing has flowed yet. **The balances do not**:
you already own what you own and owe what you owe, so month 0 carries them, and
`worth` at month 0 is your net worth today rather than a polite zero.

This is what makes a repayment read correctly. Clearing principal moves cash and
debt by the same amount, so **only the interest in a payment makes anyone
poorer** — which is why a mortgage of 120,000 at 6% over ten years costs exactly
its interest against `worth`, not the 160,000 that leaves the account. A loan on
its own still drags the total down, and that is honest: the app cannot see what
the money bought. So when there is debt and nothing owned, the form says as
much and asks for the flat to be listed.
 The
series are accumulated month by month rather than multiplied, which is what lets
a field's contribution vary over time: **`contributionOf(field, month)` is the
one function that decides what a field moves in a given month**, and periods
were added by teaching it a single rule. Amounts are rounded to whole cents at
every step, so what you read is what adds up.
Input is coerced rather than trusted: a negative or unparseable amount becomes
`0`, the horizon is clamped to 1–600 months — fifty years, which the slider now
reaches; it stopped at ten before, so a twenty-five-year mortgage could never be
followed to the month it was paid off — and both a single field and the sum
of a direction are capped at a hundred billion a month. That cap keeps every
total representable, which is not quite the same as keeping it exact: money is
held in units rather than in whole cents, and past about 35 trillion the gap
between two neighbouring doubles is wider than half a cent, so rounding has
nowhere exact to land. Below that every total is faithful; only a run at the
very ceiling — six hundred months of the largest amount the form takes —
drifts, and then by about two units in sixty trillion.

Amounts carry no currency symbol. The app never asks which currency you use, so
it never claims to know.

### What an investment actually made

A balance on its own does not say whether an investment is working. Three
figures do, and the summary carries all three: **paid in**, **what it is worth**,
and the **net profit** — the gain, less tax on it, at a rate you set that
defaults to 30%.

The investment card draws what was paid in as a dashed neutral line beneath the
value, so the gap between the two *is* the gain. It is deliberately not a
palette colour: a reference is not a category, and the palette has no slot left
to give (see the ceiling above).

Two rules the model keeps: **a loss is never taxed**, and it is never handed
back as a credit — an app that quietly returned 30% of a bad decade would be
lying in the friendly direction, which is the worse one. And **tax does not
touch `worth`**: the total is what you hold, and the tax falls due when you
sell, which the app has no way to know that you will.

### Today's money

354,000 in ten years is not 354,000. **In today's money** divides every figure
at month *m* by the same deflator, `(1 + i)^m` — what that pile would buy now.

One factor per month is what makes it safe: it leaves every identity standing,
so net is still income less expenses and worth is still the balance sheet.
Deflating each flow at the month it landed would break the second, which is the
one a reader is most likely to check by hand. For the same reason the two
derived series are recomputed from the restated parts rather than restated
themselves — four independently rounded numbers need not add up to the rounded
whole, and a total a cent away from its own components is exactly the kind of
thing this model refuses to print.

### A range instead of a line

One rate drawn as one crisp curve claims to know something nobody knows. **Show
a range** re-runs the projection with every *return* moved down and up by a few
points and shades the region between, on the two cards a return can move.

Loan interest is deliberately left where it is: what a loan costs was agreed,
not guessed. And the pessimistic run is allowed to go **negative** — growth and
loan interest use separate functions precisely so that a bad decade reads as a
loss rather than bottoming out at flat, which would understate the very case the
reader turned the band on to see.

The comparison chart gets no band: four strategies with a shaded region each is
mud, and colour there already means strategy.

## The charts

Line charts hand-drawn as SVG in [`assets/js/chart.js`](assets/js/chart.js).
One component draws every chart in the app: it takes a list of series and lays
out however many it is given — the flow cards pass one each, the comparison
chart passes one per strategy.

- **One shared vertical scale** across the three flow cards, so the curves can
  be read against each other. Two y-scales on one plot would invent a
  correlation that isn't in the data; three cards on one scale don't. The
  investment-value card is the exception, and says so: a balance is not a
  cumulative flow, and would flatten to nothing on the flows' axis. The total
  goes back on the shared scale on purpose: the point of that card is the gap
  between it and the net beside it, which is exactly what the investments have
  added, and its own scale would hide it.
- **Series colours** come from a validated categorical palette — slots 1–3
  (blue, orange, aqua) for income, expenses and net, a fourth (purple) for the
  investment balance, a fifth (magenta) for the total, and the first four again
  in the comparison chart, where they mean strategy. Every pair clears the
  colour-blind and normal-vision separation floors in both light and dark mode.
  The fourth and fifth were found by searching OKLCH space against the
  validator, because no documented step clears the all-pairs floors beside the
  ones already in use. The fifth is the harder search: a colour can sit on the
  CVD *floor* and still validate, and the shipped four all clear the higher
  *target*, so the search held that bar rather than the one that merely passes.
- **Nothing is gated behind hover.** Each line is labelled at its endpoint —
  labels nudge apart when two lines finish close together — a crosshair tooltip
  follows the pointer (and the arrow keys: `Shift` jumps a year, `Home`/`End`
  jump to the ends), hovering one flow card moves all three, and every card has
  a table view with the exact monthly figures.
- **A band is context, not a mark.** It is painted under everything, at low
  opacity, in its line's own colour — and its bounds are columns in the card's
  table, because no figure in this app lives only inside a drawing.
- **Dark mode is a selected palette**, not an inverted one.

**Five series colours is the ceiling, and dark mode is why.** A debt card was
the obvious sixth and was dropped after measuring: every crimson that clears the
all-pairs CVD target beside the existing five sits at chroma 0.10 — the floor
where a colour starts reading grey — *and* under 3:1 against the dark surface.
Two gates at their limits at once, which the shipped aqua (2.74:1 in light, but
chroma 0.14) never was. So debt is a tile and a comparison column instead. The
search is worth re-running before anyone adds a sixth: it is in the history of
this file, and it returns nothing better.

## Where the money goes

Below the flow cards, a Sankey: every income field into a pool, and the pool out
to every expense field plus whatever is kept, over the whole horizon.

**The pool is load-bearing.** Money is fungible and nothing in the model says
which salary paid which bill, so ribbons drawn income-to-expense would invent an
allocation nobody entered. Everything arrives, mixes, and leaves.

**Only a conserving cut of the model can be drawn**, and there is exactly one:
`income = expenses + net`. Investment growth, asset appreciation and drawn loan
principal all enter `worth` with no source, and a ribbon for them would be a
claim the arithmetic cannot support — those belong to the cards above, which
carry balances rather than flows. An asset needs no special case to stay out: it
moves no cash, so it weighs nothing.

**Widths are apportioned out of the totals, never summed beside them.** Ten
independently rounded shares can miss their own total by a few cents, and a
diagram that disagrees with the tile above it is worse than no diagram, so
`shareOut()` hands the leftover cents to the largest remainders and the parts add
up by construction. The same function shares out the percentage column, so that
comes to a hundred rather than 99.98. It also means the diagram inherits whatever
the projection already did: restating in today's money divides every figure at a
month by one factor, which leaves proportions untouched, so the shape is
invariant and only the labels move.

**When you spend more than you earn the leftover node changes sides.** A Sankey
cannot draw a negative flow, so aqua joins on the left as *made up from savings*
instead of leaving on the right as *kept* — one colour, one idea, on whichever
side the gap falls. When income and outgoings match exactly there is no node at
all: a flow of nothing is not a flow.

### A repayment is not one thing

Drawn as a single ribbon a mortgage says only "this much left", which is the one
question the diagram exists to go past. So a loan arrives as the parts its
repayments are actually made of — **principal**, **fees** and **interest** —
each a strand of its own, named rather than coloured, because the diagram seats
three tones and they already mean in, out and left over.

Both halves of the split are read from figures the app already stands behind
rather than derived afresh: the total from `fieldTotalOf`, which is what the
diagram draws, and what has come off the balance from `outstandingOf`, which is
what the debt tile shows. The interest is then whatever is left over, so the
parts sum to the whole by construction rather than by luck — and the fees, being
lent inside the principal, are apportioned out of it, so those two add up
exactly too. Accumulating each month's interest instead was the obvious way and
the wrong one: rounding twelve times a year for twenty-five years put it
seventeen cents adrift of the figure the field's own row quotes.

A horizon shorter than the term splits what has *been paid*, not what will be:
ten years into a twenty-five year mortgage the strands are the interest and
principal of those ten years, and they still come to exactly what the diagram
draws for it. A loan with neither interest nor fees is one strand and keeps its
plain name; once it splits, every strand is named, so no strand can be mistaken
for the whole.

One consequence worth knowing rather than discovering: at 0% a payment rounded
to the cent need not divide the principal evenly, so 200,000 over 300 months
repays 200,001 and the extra unit is reported as interest. That is what
`loanInterest` has always said and what the field's row shows; the diagram
agrees with them rather than quietly disagreeing.

### Why three colours, and only three

A Sankey is an **all-pairs** form — at a node face the layout decides which two
ribbons end up touching, so every pair has to be distinguishable, not just the
neighbours in a legend. Three is what that seats, and three is what the diagram
needs: in, out, kept. A hue per field was never available (the palette has been
full at five since the total arrived) and would not have been right anyway —
field names are nominal, and colouring them would burn the only free channel on
information the ribbon's width already carries.

So the ribbons are washes of their direction's hue rather than blocks — they are
the largest painted areas in the app — with a hairline in the surface colour so
neighbouring flows never fuse. Names and amounts sit outside in text tokens, and
are truncated by measurement rather than clipped.

**A wash cannot carry identity, and no opacity fixes that.** Composited against
the surface, the three washes sit ΔE 3.6 apart for a normal-vision reader at the
16% they ship at — and running the validator up the scale, they reach only 13.1
at 55%, which is already the saturated block the mark specs forbid at this size.
The floors are 15 and 8. So the wash is deliberately *not* an identity channel:
it is connective tissue, and identity is carried four times over by the solid
node rectangles (which do pass, at ΔE 9.2 light and 9.4 dark), the name written
beside every node, the legend, and the table. Anyone tempted to make the ribbons
"clearer" by saturating them should re-run that measurement first: it does not
work, and it costs the card its calm.

### The two places it degrades, and what it does about them

- **A sliver.** A rent of 40 beside a salary of 500,000 is a hundredth of a
  pixel: honest and invisible. Every flow gets a floor of 2.5px, which makes
  widths not exactly proportional — a bounded distortion, in exchange for no
  flow ever vanishing, and the table has the exact figures.
- **A crowd.** A hundred fields is allowed and a hundred strands is not a
  diagram; past a few dozen the gaps alone outrun the height. Columns past nine
  strands pool the smallest into one node, and **the table still lists every
  field on its own row** — pooled in the picture, never lost.

Both columns are drawn to one height budget, because the same money passes
through the pool and its two faces have to match. Subtracting each column's own
gaps instead leaves a node where more flows out than in, which is precisely the
thing a flow diagram exists to rule out.

## Layout

```
index.html                 markup + i18n hooks (data-i18n)
manifest.webmanifest       installability (manifest.fr.webmanifest: the same
                           app, named in French)
sw.js                      offline shell
assets/css/app.css         design tokens (light + dark), shell, chart chrome
assets/js/fields.js        the field model — shape, coercion, operations
assets/js/strategies.js    the strategy model — a named set of fields
assets/js/projection.js    fields + horizon → the cumulative series
assets/js/field-list.js    the editable list of fields
assets/js/strategy-bar.js  the tabs that name, switch and add strategies
assets/js/chart.js         the SVG line chart, one or many series
assets/js/sankey.js        the flow diagram: in, pooled, out
assets/js/dom.js           the two DOM helpers the views share
assets/js/format.js        locale-aware number formatting
assets/js/i18n.js          English and French copy
assets/js/app.js           wiring: inputs, state, theme, language, install, updates
tools/generate-icons.mjs   icon set, rendered from a vector description
tools/serve.mjs            development server (never deployed)
test/                      node:test unit tests
```

## What am I running

**About** in the header opens a panel with the build and the changelog. It is a
dialog rather than a second page, so it inherits the theme, the language and the
shell the app already has instead of keeping a second copy of each in step.

The **version** is read from the cache generation the service worker is actually
serving, which is the question the panel exists to answer — *is what I am looking
at the current one* — rather than a number restated from a file that could
disagree with it. A test fails if the stamp and `CACHE_VERSION` ever do.

**The commit is the honest part.** There is no build step: Pages serves the
branch as it stands, so nothing runs at deploy time to stamp a hash in, and a
commit cannot contain its own hash — under squash merges the branch commit does
not even survive into `main`. So `npm run stamp` records what *is* knowable — the
version, the branch, and the commit the working tree sits on top of — and the
panel says **built from**, which is the true statement. Every released version in
the changelog below carries the commit it was merged as, which is exact, because
that is history.

The newest entry has no commit until the merge that publishes it creates one;
it is filled in with the next change, and the panel says *not yet released* in
the meantime. The test allows that for the newest entry and no other.

The changelog keeps both languages side by side in
[`assets/js/changelog.js`](assets/js/changelog.js) rather than in the dictionary:
it grows one entry per release and the two readings of an entry are written
together, so splitting them would only let them drift. A test holds its French to
the same typography rule the dictionary is held to — and caught three breaking
spaces in it the first time it ran.

## Offline and updates

`sw.js` treats its cache as one immutable generation: the page, the CSS and the
JS are precached together on install and served together from that same
generation. Nothing is refreshed behind the app's back, so you never get a fresh
page wired to stale scripts — the failure mode of an unhashed static app that
mixes network-first HTML with cached assets.

A new version therefore arrives whole. A new worker installs its own cache
alongside the running one, and the app offers a **Reload** button rather than
swapping the page out mid-edit; accepting it activates the new worker, drops the
old cache, and reloads. Declining it changes nothing until the next visit.

Accepting it in one tab activates the worker for every tab, so the others are
left running the old build under the new worker. They keep the same offer — with
nothing left to skip, Reload there simply reloads — and a tab that had not been
offered anything gets the offer at that moment, because it has just become the
stale one.

Nothing here goes to the network otherwise, so the app has to ask. It asks when
you open it, and no more than once an hour: the time of the last look is kept in
the store, so however many tabs are open it is one question a device asks. Coming
back to a backgrounded app counts as opening it, which is how an installed app
that is never reloaded still hears about a new version. **Check for updates** in
the About panel asks whatever the clock says, and says what it found.

**Bump `CACHE_VERSION` in `sw.js` whenever a precached file changes.** That is
the one manual step in the whole project — there is no build to do it for you,
and browsers only look for a new worker when `sw.js` itself changes. CI fails
the build if a precached file moves without it.

## Languages

The interface ships in English and French. On first load the app picks the
browser's language if it speaks it; the header toggle overrides that and the
choice is remembered. Number formatting follows the same choice — `72,000` in
English, `72 000` in French.

A manifest has no per-language strings, so there is one per language and the app
points `<link rel="manifest">` at the right one — that is what names the app in
the install prompt. Both declare the same `id`, `start_url` and `scope`, so it
stays one installed app; the tests enforce that.

To add a language, add a block to `STRINGS` in
[`assets/js/i18n.js`](assets/js/i18n.js) (the English block is the key list to
match) and add its code to `LANGUAGES`. Static markup is translated through
`data-i18n` attributes; anything dynamic goes through the same dictionary —
including punctuation that differs between languages, such as the no-break space
French sets before a colon. The tests check that every language carries the same
keys with the same parameters, so a half-translated release fails the build.

## Your data

Three keys in `localStorage`, on your device only: `finapp.state.v3` (your
strategies, horizon, and the assumptions — inflation, the spread on returns,
and the tax rate — with their toggles), `finapp.theme.v1` and `finapp.language.v1`. Older
stores are read on first load and then retired, so nobody loses what they had
typed: `finapp.state.v2`, a flat list of fields, becomes the first strategy, and
`finapp.inputs.v1`, a lone income and rent from before fields existed, becomes
those two fields. The old key is dropped only after the new one is written, so a
failed write leaves the old store where it was rather than losing both.
Nothing is sent anywhere — the app makes no network requests after loading its
own files.

## Extending it

The point of the field model is that the common kind of growth — *more things to
track* — costs nothing: that is what the "Add a field" button already does, and
the projection sums whatever it is given.

**Giving fields a new attribute** (a start month, an end month, a category) is
the next-cheapest kind of change, and it has one seam. Periods went
in this way — a schema entry, a rule in `contributionOf`, one control — so the
steps below are a description of a change that has actually been made, not a
hope:

1. Add an entry to `FIELD_SCHEMA` in `fields.js` — a default and how to read
   whatever turns up in its place. That is the whole edit: normalisation,
   storage, migration, duplication and the list's reconciliation all read the
   schema rather than naming keys of their own.
2. Give it meaning in `contributionOf()` in `projection.js` — the one function
   that decides what a field moves in a given month.
3. If it needs a control: build it in `createRow`, sync it in `syncRow`, and
   send its edits through the existing command stream — plus its label in
   `i18n.js` and one line in `fieldLabels()` in `app.js`, since the list owns no
   English of its own. The row is a wrapping flex line, so no layout change.

This was measured, not assumed: adding a per-field start month took six edits
across exactly those three files, and duplication, storage round-trips and the
v1 migration carried the new attribute with no changes at all.

**A new derived series** (savings, taxes, a running balance) is a key on each
point in `project()` plus one entry in the `CHARTS` list in `app.js` — and, if
it belongs in the comparison, one more in `METRICS`. The chart
component takes any `{month, value}` series and needs no changes — the
investment-value card was added exactly that way, with two flags on its entry:
`onlyWithInvestments` to draw it only when it has something to say, and
`ownScale` because a balance is not a cumulative flow and flattens to nothing on
the flows' shared axis. The total came the same way and cost a line in
`project()`, an entry in each list, and a colour — the colour being the only
part that took real work.

**A new kind of field** (a mortgage with an offset, a pension with employer
matching) is an entry in `KINDS`, a branch in `contributionOf`, the controls it
needs in `createRow`, and which of them to show in `syncRow`. A kind that holds
a balance rather than moving cash — the way *something you own* does — adds its
running total to the loop in `project()` and returns `0` from `contributionOf`.

**Something a strategy carries** (a note, a start date, a colour of its own) is
the same shape one level up: `strategies.js` owns the shape and the operations,
`app.js` owns the storage version and the migration into it, and the comparison
view reads whatever `project()` returns. A new column in the comparison switch
is a key on each point plus an entry in `METRICS` and one in the dictionary.

**A new language** is a block in `i18n.js`; the tests fail if it is missing a
key that another language has.

Two habits keep this cheap: model operations are pure and return new lists, so
state changes stay traceable; and the list UI reconciles rows in place rather
than re-rendering, so nothing you add can start stealing focus mid-edit.

## Browser support

Any browser with ES modules, `Intl.NumberFormat`, CSS custom properties and
`ResizeObserver` — Chrome/Edge 88+, Firefox 89+, Safari 15+. Installability
depends on the browser: Chromium prompts, Safari installs through *Add to Home
Screen*. The app degrades to a plain page if service workers are unavailable.
