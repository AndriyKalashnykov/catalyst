/**
 * The explicit base-10 radix for `parseInt`. Passing the radix is the
 * lint-recommended idiom (an omitted radix lets leading-zero / `0x`
 * strings misparse across engines). Named once so the bare `10` does
 * not recur as an unexplained literal at call sites.
 */
export const DECIMAL_RADIX = 10
