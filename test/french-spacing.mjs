/**
 * The French spacing rule, in one place, because two test files hold text to
 * it: the dictionary and the changelog.
 *
 * French sets a NO-BREAK SPACE before `: ; ? ! %` and inside `« »`. It has to
 * be unbreakable, or the punctuation lands on a line of its own — which is the
 * whole reason the rule exists rather than being a matter of taste.
 *
 * Both halves of the guillemet pair are checked. Only the closing one was, and
 * only because `»` happened to be in the list of things a space may not precede
 * — nothing looked at what follows a `«`, so a phrase could open a quotation
 * with an ordinary space and no test noticed.
 */

/** The no-break spaces French uses: the ordinary one and the narrow one.
 *  Written as escapes on purpose — as literals they are invisible here, and
 *  one round trip through something that trims whitespace turns this rule
 *  into one that accepts what it exists to reject. */
const UNBREAKABLE = '\u00a0\u202f';

/**
 * The first fragment of `text` that breaks the rule, or null if none does.
 *
 * A fragment rather than a boolean so a failure names what it found: "e :" in
 * a wall of prose is otherwise a needle nobody can see.
 */
export function breakingSpaceIn(text) {
  // `\s` already covers U+00A0 and U+202F, so `\S` is every character a space
  // may legitimately follow.
  const before = /\S [:;?!»%]/.exec(text);
  if (before) return before[0];
  const opening = new RegExp(`«(?![${UNBREAKABLE}])[^]?[^]?`).exec(text);
  return opening ? opening[0] : null;
}
