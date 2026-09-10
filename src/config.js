// All Stonk Wars knobs. No secrets here — keys live in .env (see .env.example).
module.exports = {
  PORT: Number(process.env.PORT) || 3737,

  // --- the tournament ---
  STONK_START_USD: 1000,               // every animal starts with this (paper money)
  STONK_MATCH_MS: 60 * 60_000,         // one hour per round; all matches in a round run at once
  STONK_INTERMISSION_MS: 3 * 60_000,   // break between rounds (and the pick window before round 1)
  STONK_CHAINS: ['solana', 'base', 'bsc'], // chains the shared coin feed watches

  // Paper fill model: round-trip cost by chain (fee + typical impact floor).
  RH_FEE_BY_CHAIN: { solana: 0.015, base: 0.012, bsc: 0.015, robinhood: 0.03, ethereum: 0.05 },
  RH_FEE_PCT: 0.015,

  // --- PICK 'EM: free picks, owner-funded prize ---
  // Entry is FREE by design; that keeps this a promotion, not a betting pool.
  STONK_PAYOUT_ENABLED: false,         // true = settle() sends SOL; false = record what is owed
  STONK_PAYOUT_PCT: 0.25,              // share of creator fees ACCRUED DURING EACH ROUND paid to correct pickers
  STONK_PAYOUT_RESERVE_SOL: 0.02,      // left in the payout wallet for tx fees
  STONK_PAYOUT_MAX_SOL_PER_ROUND: 0,   // 0 = no cap
  STONK_PAYOUT_MIN_SOL: 0.001,         // skip payouts when the per-wallet share is dust
  STONK_PAYOUT_WALLET: '',             // public address to read the pool from when STONK_PAYOUT_KEY is unset
  STONK_FEE_VAULT: '',                 // optional: launchpad creator-fee vault (unclaimed fees count toward accrual)
  // Sybil brakes (default off). Gate on holding the project token once it exists.
  STONK_VOTE_MIN_SOL: 0,
  STONK_VOTE_TOKEN_MINT: '',
  STONK_VOTE_MIN_TOKENS: 0,
};
