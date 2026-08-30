/**
 * Handing a plan to somebody else.
 *
 * Everything this app knows lives in one browser's storage, which is the whole
 * point of it and also the one thing that makes it awkward: there is no account
 * to share from and no server holding a copy to link to. So the link *is* the
 * copy. A whole configuration — every strategy, every field, the horizon and
 * the assumptions — is packed into the fragment of a URL, and a fragment is the
 * one part of a URL a browser never sends to a server. The plan travels through
 * whatever you paste it into and arrives on the other person's device without
 * having been anybody else's to read on the way, which is the same promise the
 * rest of the app makes, kept in the one place where it has to let go.
 *
 * Nothing here is compressed, and that is a decision rather than an omission.
 * `CompressionStream` would roughly halve the link, but it lands above this
 * app's browser floor — so a link written in one browser could not be opened in
 * another, which for a thing whose entire purpose is to be opened elsewhere is
 * the worst failure available. One format every supported browser can both
 * write and read is worth more than a shorter address.
 */

import { FIELD_SHAPE, newId, normalizeFields } from './fields.js';
import { MAX_STRATEGIES, normalizeStrategies } from './strategies.js';
import { MAX_MILESTONES } from './milestones.js';

/** What the fragment calls it: `#plan=…`. */
export const PLAN_KEY = 'plan';

/**
 * The format's own version, so a later one that cannot be read as this one can
 * say so instead of decoding into a plan nobody wrote. Bump it only for a
 * change that breaks old links; adding an attribute does not, because a link
 * that never mentioned it reads as the default.
 */
export const PLAN_VERSION = 1;

/**
 * The order a field's attributes travel in.
 *
 * This is a wire format, and therefore **append-only**: a link written today
 * names its values by their position in this list, so inserting into the middle
 * would silently make every link already in somebody's messages decode into a
 * different plan. New attributes go on the end.
 *
 * `id` is not here — an id means nothing outside the device that made it, and
 * travels as a slot number instead (see `encodePlan`).
 *
 * A test holds this list to `FIELD_SCHEMA`, so an attribute cannot be added to
 * the model and forgotten here. Forgetting it would not break anything loudly:
 * it would simply never travel, and the reader on the other end would get a
 * plan quietly missing the thing you shared it for.
 */
export const WIRE_KEYS = [
  'labelKey',
  'label',
  'direction',
  'amount',
  'kind',
  'annualRate',
  'fees',
  'termMonths',
  'periodMonths',
  'startMonth',
  'endMonth',
  'sellMonth',
  'synced',
];

/* --------------------------------------------------------------- the format */

/**
 * A field as `[slot, index, value, index, value, …]`, carrying only what
 * differs from the default. Most fields differ in three or four places, so the
 * sparse form is a third of the size of writing every attribute out — and it is
 * also what makes an older link readable: an attribute it never mentions is one
 * `normalizeFields` fills in, exactly as it does for a store written before that
 * attribute existed.
 */
function encodeField(field, slotOf) {
  const row = [slotOf(field.id)];
  WIRE_KEYS.forEach((key, index) => {
    const value = field[key];
    if (value === undefined || value === FIELD_SHAPE[key]) return;
    row.push(index, value === true ? 1 : value === false ? 0 : value);
  });
  return row;
}

function decodeField(row, idOf) {
  if (!Array.isArray(row) || !row.length) return {};
  const field = { id: idOf(row[0]) };
  for (let at = 1; at + 1 < row.length; at += 2) {
    const key = WIRE_KEYS[row[at]];
    // An index this version has never heard of comes from a newer one: skip it
    // rather than refuse the whole plan, which would make every link stop
    // working the day an attribute is added.
    if (!key) continue;
    const value = row[at + 1];
    // Booleans travel as 1, since only a value that differs from its default is
    // written at all. Which keys are boolean is read from the shape rather than
    // listed again here.
    field[key] = typeof FIELD_SHAPE[key] === 'boolean' ? value === 1 || value === true : value;
  }
  return field;
}

/**
 * Pack a plan into text.
 *
 * Ids become slot numbers. An id is a UUID that means nothing on another
 * device, and writing them out would be a third of the link — but two synced
 * fields in different strategies are *the same field* precisely because they
 * share one, so the sameness has to survive the trip even though the id itself
 * must not. Numbering them does both: identical ids get identical slots, and
 * the far end mints fresh ids one per slot.
 *
 * Returns '' if the plan cannot be packed, which is the same answer as "there
 * is nothing to share" and needs no separate handling by the caller.
 */
export function encodePlan(state) {
  if (!state || !Array.isArray(state.strategies)) return '';
  const slots = new Map();
  const slotOf = (id) => {
    if (!slots.has(id)) slots.set(id, slots.size);
    return slots.get(id);
  };

  const plan = {
    v: PLAN_VERSION,
    m: state.months,
    i: state.inflation,
    sp: state.spread,
    tx: state.tax,
    s: state.strategies.slice(0, MAX_STRATEGIES).map((strategy) => [
      strategy.name || '',
      strategy.nameKey || '',
      (strategy.fields || []).map((field) => encodeField(field, slotOf)),
    ]),
  };
  // The two toggles are written only when they are on, which is the common
  // plan's saving and matches how a field omits its defaults.
  if (state.realMoney) plan.r = 1;
  if (state.showRange) plan.b = 1;
  // The targets, if there are any. They go because they are part of what is
  // being asked rather than part of the answer — somebody sending "here is how
  // I would buy it" is usually sending "and here is when it happens" with it.
  // Each travels as `[metric, amount]`, and that pair is a wire format like
  // every other list here: append to it, never insert.
  if (Array.isArray(state.milestones) && state.milestones.length) {
    plan.ms = state.milestones.slice(0, MAX_MILESTONES).map(
      (milestone) => [milestone.metric, milestone.amount],
    );
  }

  try {
    return toBase64Url(JSON.stringify(plan));
  } catch {
    return '';
  }
}

/**
 * Unpack text into the shape a stored plan has, or null if it is not one.
 *
 * The strategies come back normalised, because `normalizeStrategies` is already
 * the app's one answer to "make sense of whatever this is" and a link is exactly
 * as untrustworthy as a hand-edited store. The scalars come back as they were
 * written, for the caller to put through the same coercion it puts a stored
 * plan through — a link cannot be allowed a horizon a store could not have.
 */
export function decodePlan(text) {
  if (typeof text !== 'string' || !text) return null;
  let plan;
  try {
    plan = JSON.parse(fromBase64Url(text));
  } catch {
    return null;
  }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
  // A version from the future is one this build cannot promise to read: say so
  // rather than guess at it.
  if (Number(plan.v) !== PLAN_VERSION) return null;
  if (!Array.isArray(plan.s) || !plan.s.length) return null;

  const ids = new Map();
  const idOf = (slot) => {
    const key = String(slot);
    if (!ids.has(key)) ids.set(key, newId());
    return ids.get(key);
  };

  const strategies = normalizeStrategies(plan.s.map((entry) => {
    const [name, nameKey, fields] = Array.isArray(entry) ? entry : [];
    return {
      name: typeof name === 'string' ? name : '',
      // Carried so a plan the app named follows the *reader's* language rather
      // than arriving frozen in the sharer's.
      nameKey: typeof nameKey === 'string' ? nameKey : '',
      fields: normalizeFields((Array.isArray(fields) ? fields : []).map((row) => decodeField(row, idOf))),
    };
  }));

  return {
    strategies,
    months: plan.m,
    inflation: plan.i,
    spread: plan.sp,
    tax: plan.tx,
    realMoney: plan.r === 1,
    showRange: plan.b === 1,
    // Shaped but not judged, the way the scalars above are. Which quantities
    // may be targeted is the app's list rather than the format's, so the caller
    // — which holds that list — is what turns these into targets it will accept.
    milestones: (Array.isArray(plan.ms) ? plan.ms : [])
      .slice(0, MAX_MILESTONES)
      .filter(Array.isArray)
      .map(([metric, amount]) => ({
        metric: typeof metric === 'string' ? metric : '',
        amount: typeof amount === 'number' || typeof amount === 'string' ? String(amount) : '',
      })),
  };
}

/* ------------------------------------------------------------- the link */

/** The packed plan in a URL's fragment, or '' if there is none. */
export function planInHash(hash) {
  if (typeof hash !== 'string') return '';
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get(PLAN_KEY) || '';
}

/**
 * The address to hand over: this page, carrying this plan.
 *
 * Any query string on the current address is dropped rather than carried along.
 * It belongs to how *you* arrived — a campaign tag, a preview parameter — and
 * has nothing to do with the plan being shared.
 */
export function linkFor(state, href) {
  const packed = encodePlan(state);
  if (!packed) return '';
  const url = new URL(href);
  url.search = '';
  url.hash = `${PLAN_KEY}=${packed}`;
  return url.toString();
}

/* ----------------------------------------------------------------- base64url */

/*
 * Written by hand because a fragment has to survive being pasted into a chat
 * window, an email and a QR code, and plain base64's `+ / =` do not: `+` comes
 * back as a space from more than one of them. TextEncoder rather than `escape`
 * so a plan named in any language survives the trip.
 */

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  // The padding is dropped on the way out because it is noise in an address;
  // some `atob` implementations want it back.
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
