// Set utilities

/**
 * Remove all elements in `b` from `a`.
 *
 * If an element is in `b` but not in `a`, that element is still not in the result.
 *
 * No sets are mutated. A new set is returned.
 */
export const difference = <T>(a?: Set<T>, b?: Set<T>): Set<T> => {
  if (a === undefined) return new Set();
  if (b === undefined) return new Set(a);
  const res = new Set(a);
  b.forEach((v) => res.delete(v));
  return res;
};

/**
 * Create a new set containing all the elements of `a` and `b`.
 *
 * Does not mutate the input sets. A new set is returned.
 */
export const union = <T>(a?: Set<T>, b?: Set<T>): Set<T> => {
  if (a === undefined) return new Set(b);
  if (b === undefined) return new Set(a);
  const big = a.size > b.size ? a : b;
  const lil = big === a ? b : a;
  lil.forEach((v) => big.add(v));
  return big;
};
