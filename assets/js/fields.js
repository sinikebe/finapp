/**
 * fields.js — the money fields.
 *
 * Every amount in the app is a field. Income and rent are simply the two the
 * app starts with, not special cases: any field can be renamed, switched
 * between income and expense, duplicated or removed, the starting two included.
 *
 * To give fields a new attribute later — a start month, an end month, a growth
 * rate — add it to FIELD_SCHEMA with a sensible default and how to read it.
 * Everything downstream (storage, migration, duplication, the UI's
 * reconciliation) carries it without further changes; only the code that gives
 * it meaning, `contributionOf` in the projection, needs to know what it is.
 */

/** The two directions money can flow. A field's direction carries the sign, so
 *  amounts themselves stay positive and can't smuggle in a negative. */
export const DIRECTIONS = ['income', 'expense'];

/**
 * How often an amount lands, in months. A period is a count rather than a name
 * so the projection can do arithmetic with it and a new one — every two years,
 * say — is a number here and a dictionary entry, nothing more.
 */
export const PERIODS = [1, 3, 6, 12];
export const DEFAULT_PERIOD = 1;

/**
 * What a field *is*. A plain field simply repeats; a loan repays a borrowed sum
 * over a term; an investment puts money in and lets it grow; an asset is
 * something you already own, which moves no cash at all. The kind decides
 * which attributes matter — the projection reads them, the row shows them — so
 * a new kind is an entry here, a rule in `contributionOf`, and its controls.
 */
export const KINDS = ['plain', 'loan', 'investment', 'asset'];
export const DEFAULT_TERM = 60;

/**
 * Every attribute a field has: its default, and how to make sense of whatever
 * turns up in its place. **This is the only place to edit to give fields a new
 * attribute** — normalisation, storage, duplication and migration all read it
 * from here rather than naming keys of their own.
 */
export const FIELD_SCHEMA = {
  id: {
    default: '',
    read: (value) => (typeof value === 'string' && value ? value : newId()),
  },
  labelKey: {
    // A dictionary key, while the reader hasn't renamed the field.
    default: '',
    read: (value) => (typeof value === 'string' ? value : ''),
  },
  label: {
    // The reader's own name; wins over labelKey when set.
    default: '',
    read: (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_LABEL_LENGTH) : ''),
  },
  direction: {
    default: 'expense',
    read: (value) => (DIRECTIONS.includes(value) ? value : 'expense'),
  },
  amount: {
    // Kept as typed; the projection coerces it to money.
    default: '',
    read: (value) => (typeof value === 'number' || typeof value === 'string' ? String(value) : ''),
  },
  kind: {
    default: 'plain',
    read: (value) => (KINDS.includes(value) ? value : 'plain'),
  },
  annualRate: {
    // A percentage per year, as typed: interest on a loan, return on an
    // investment. Meaningless on a plain field, which simply ignores it.
    default: '',
    read: (value) => (typeof value === 'number' || typeof value === 'string' ? String(value) : ''),
  },
  termMonths: {
    // How long a loan runs. Kept inside the projection's own horizon limit so a
    // hand-edited store can't ask for a million payments.
    default: DEFAULT_TERM,
    read: (value) => {
      const months = Math.trunc(Number(value));
      if (!Number.isFinite(months) || months < 1) return DEFAULT_TERM;
      return Math.min(months, 600);
    },
  },
  periodMonths: {
    // Months between one landing and the next: 1 monthly, 12 yearly. A store
    // written before periods existed has none, and reads as monthly.
    default: DEFAULT_PERIOD,
    read: (value) => (PERIODS.includes(Number(value)) ? Number(value) : DEFAULT_PERIOD),
  },
};

/** Every attribute with the value used when one is missing. */
export const FIELD_SHAPE = Object.freeze(
  Object.fromEntries(Object.entries(FIELD_SCHEMA).map(([key, spec]) => [key, spec.default])),
);

/** Guard rails against a hand-edited or corrupted store. */
export const MAX_LABEL_LENGTH = 60;
export const MAX_FIELDS = 100;

let sequence = 0;

/** A collision-free id, from the platform where it exists. */
export function newId() {
  const uuid = globalThis.crypto && globalThis.crypto.randomUUID;
  if (uuid) return globalThis.crypto.randomUUID();
  sequence += 1;
  return `field-${sequence}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Coerce anything into a well-formed field, one schema entry at a time. */
export function normalizeField(value) {
  const source = value && typeof value === 'object' ? value : {};
  const field = {};
  for (const [key, spec] of Object.entries(FIELD_SCHEMA)) {
    field[key] = spec.read(source[key]);
  }

  // Money put into an investment leaves the account like any other outgoing;
  // an "incoming investment" would be a contradiction, so the kind settles it.
  if (field.kind === 'investment') field.direction = 'expense';
  // A loan repays on a monthly schedule, so its period is not the reader's to
  // set: the term says how many payments, `contributionOf` says when.
  if (field.kind === 'loan') field.periodMonths = DEFAULT_PERIOD;
  // An asset is a thing you own, not a flow: it never lands, so a period would
  // mean nothing, and it counts towards what you are worth rather than against
  // it. Both are settled here so a hand-edited store can't say otherwise.
  if (field.kind === 'asset') {
    field.direction = 'income';
    field.periodMonths = DEFAULT_PERIOD;
  }

  return field;
}

/** Coerce anything into a well-formed list: unique ids, bounded length. */
export function normalizeFields(value) {
  const list = Array.isArray(value) ? value.slice(0, MAX_FIELDS) : [];
  const seen = new Set();
  return list.map((entry) => {
    const field = normalizeField(entry);
    if (seen.has(field.id)) field.id = newId();
    seen.add(field.id);
    return field;
  });
}

/** A new field, ready to be added. */
export function createField(patch = {}) {
  return normalizeField({ ...patch, id: patch.id || newId() });
}

/** The reader's name for a field, its translated default, or nothing. */
export function labelOf(field, t) {
  if (field.label) return field.label;
  if (!field.labelKey) return '';
  // A translator returns the key itself when it doesn't know it; a stored key
  // from another version should read as unnamed, not as `field.default.rent`.
  const translated = t(field.labelKey);
  return translated === field.labelKey ? '' : translated;
}

/* ------------------------------------------------------------- operations */
/* All of these return a new list; none mutate the one they are given. */

export function addField(fields, patch = {}) {
  const list = normalizeFields(fields);
  if (list.length >= MAX_FIELDS) return list;
  // A new field usually continues what the reader was already listing.
  const direction = patch.direction || (list.length ? list[list.length - 1].direction : FIELD_SHAPE.direction);
  return [...list, createField({ ...patch, direction })];
}

export function updateField(fields, id, patch = {}) {
  return normalizeFields(fields).map((field) => {
    if (field.id !== id) return field;
    const next = normalizeField({ ...field, ...patch, id: field.id });
    // Naming a field makes the name the reader's own; clearing it hands the
    // field back to its translated default, if it had one.
    return next;
  });
}

/**
 * Copy a field in place, right below the original.
 * @param {(label: string) => string} nameCopy how to name the copy — the model
 *   stays out of the dictionary, so the caller supplies the wording.
 */
export function duplicateField(fields, id, nameCopy, t) {
  const list = normalizeFields(fields);
  const index = list.findIndex((field) => field.id === id);
  if (index === -1 || list.length >= MAX_FIELDS) return list;

  const source = list[index];
  const copy = createField({
    ...source,
    id: newId(),
    // A copy carries a name of its own, so it no longer follows the dictionary.
    labelKey: '',
    label: nameCopy(labelOf(source, t)),
  });
  return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
}

export function removeField(fields, id) {
  return normalizeFields(fields).filter((field) => field.id !== id);
}

/** The field that should take focus once `id` is gone: the next, else the previous. */
export function neighbourOf(fields, id) {
  const list = normalizeFields(fields);
  const index = list.findIndex((field) => field.id === id);
  if (index === -1) return null;
  const neighbour = list[index + 1] || list[index - 1];
  return neighbour ? neighbour.id : null;
}

/* ---------------------------------------------------------------- defaults */

/** What a first-time reader starts with: one income, one expense. */
export function defaultFields() {
  return [
    createField({ labelKey: 'field.default.income', direction: 'income' }),
    createField({ labelKey: 'field.default.rent', direction: 'expense' }),
  ];
}

/**
 * Carry a v1 store — a single income and a single rent — into the field model.
 * The two become ordinary fields, keeping their translated names.
 */
export function migrateLegacyInputs(legacy) {
  const source = legacy && typeof legacy === 'object' ? legacy : {};
  return [
    createField({ labelKey: 'field.default.income', direction: 'income', amount: source.income }),
    createField({ labelKey: 'field.default.rent', direction: 'expense', amount: source.rent }),
  ];
}
