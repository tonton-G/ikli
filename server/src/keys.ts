import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

// Short, common words keep keys typeable; entropy comes from the combination
// (140 * 10000 * 140 ≈ 2^27) plus the slug they're scoped to.
const WORDS = [
  'tide', 'plum', 'fern', 'moss', 'dune', 'reef', 'wren', 'lark', 'pine', 'sage',
  'clay', 'mist', 'dawn', 'dusk', 'leaf', 'root', 'bark', 'seed', 'rain', 'snow',
  'wind', 'wave', 'foam', 'silt', 'peat', 'loam', 'vale', 'glen', 'peak', 'crag',
  'ford', 'weir', 'pond', 'lake', 'brook', 'creek', 'delta', 'shoal', 'cliff', 'ridge',
  'stone', 'flint', 'slate', 'chalk', 'coral', 'pearl', 'amber', 'jade', 'opal', 'onyx',
  'birch', 'cedar', 'aspen', 'maple', 'alder', 'hazel', 'rowan', 'olive', 'ivy', 'reed',
  'heron', 'finch', 'robin', 'swift', 'crane', 'raven', 'crow', 'dove', 'kite', 'teal',
  'otter', 'vole', 'hare', 'fox', 'lynx', 'seal', 'newt', 'toad', 'moth', 'bee',
  'ember', 'spark', 'flame', 'ash', 'soot', 'coal', 'frost', 'hail', 'sleet', 'thaw',
  'north', 'south', 'east', 'west', 'noon', 'eve', 'morn', 'night', 'star', 'moon',
  'comet', 'nova', 'orbit', 'polar', 'zenith', 'nadir', 'cove', 'bay', 'cape', 'isle',
  'marsh', 'fen', 'bog', 'heath', 'moor', 'wold', 'dell', 'holt', 'shaw', 'combe',
  'plume', 'quill', 'vellum', 'ochre', 'umber', 'sepia', 'indigo', 'cobalt', 'viridian', 'madder',
  'anise', 'clove', 'cumin', 'thyme', 'basil', 'mint', 'dill', 'chive', 'caper', 'maize',
] as const;

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l/i

export function generateSlug(length = 4): string {
  let out = '';
  for (let i = 0; i < length; i++) out += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  return out;
}

export function generateEditKey(): string {
  const a = WORDS[randomInt(WORDS.length)];
  const b = WORDS[randomInt(WORDS.length)];
  const n = randomInt(1000, 10000);
  return `${a}-${n}-${b}`;
}

export function hashEditKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function verifyEditKey(key: string, hash: string): boolean {
  const a = Buffer.from(hashEditKey(key), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
