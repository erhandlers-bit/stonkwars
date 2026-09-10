// All Stonk Wars knobs. No secrets here — keys live in .env (see .env.example).
module.exports = {
  PORT: Number(process.env.PORT) || 3737,

  // --- the tournament ---
  STONK_START_USD: 1000,               // every animal starts with this (paper money)
  // one hour per round; all matches in a round run at once. Env overrides
  // exist so a rehearsal can run with 3-minute rounds: STONK_MATCH_MS=180000
  STONK_MATCH_MS: Number(process.env.STONK_MATCH_MS) || 60 * 60_000,
  STONK_INTERMISSION_MS: Number(process.env.STONK_INTERMISSION_MS) || 3 * 60_000, // break between rounds (and the pick window before round 1)
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
  // --- COMMENTARY (the showcase view) ---
  STONK_BANTER_MS: 45_000,          // Claude-written banter cadence; 0 = scripted lines only
  STONK_CHAT_REPLY_MS: 30_000,      // the desk reads the stream chat and answers this often (0 = never)
  STONK_CHAT_MODEL: 'claude-opus-5',   // the desk answers chat with Opus 5 (owner 2026-09-10); banter stays on STONK_BANTER_MODEL
  STONK_INTERVIEW_MS: 4 * 60_000,   // a commentator interviews a random live animal this often
  STONK_BANTER_MODEL: 'claude-haiku-4-5-20251001', // cheap and fast; four hours costs cents
  STONK_LINE_GAP_MS: 3500,          // a commentator will not talk over itself faster than this

  // --- TREASURY (owner 2026-09-10): claim fees -> buy the coin -> pay winners IN the coin ---
  // Per round: claim all pump.fun creator fees; swap STONK_BUYBACK_PCT of them
  // into STONK_BUYBACK_MINT; send STONK_WINNER_SHARE of the coin bought, split
  // evenly, to the correct pickers. LIVE needs STONK_TREASURY_ENABLED true and
  // STONK_PAYOUT_KEY = the DEV (creator) wallet key — the claim must be signed
  // by the creator. Otherwise it dry-runs and records what it would have done.
  STONK_TREASURY_ENABLED: false,
  // owner 2026-09-10: "buy back its OWN token and pay out in it, not $PRO" — paste the
  // STONK WARS coin mint here at launch. Empty = no buyback; settlements are recorded as owed.
  STONK_BUYBACK_MINT: '',
  STONK_COIN_SYMBOL: 'STONK',       // ticker shown on the site until the mint is set (then Dexscreener's symbol wins)
  STONK_BUYBACK_PCT: 0.5,           // half of claimed fees buy the coin
  STONK_WINNER_SHARE: 0.5,          // half of the coin bought goes to the correct pickers
  STONK_SWAP_SLIPPAGE_BPS: 300,     // 3% on the Jupiter swap
  STONK_TREASURY_MIN_SOL: 0.01,     // skip the round if unclaimed fees are below this
  STONK_CLAIM_PRIORITY_FEE: 0.00005,

  // Sybil brakes (default off). Gate on holding the project token once it exists.
  STONK_VOTE_MIN_SOL: 0,
  STONK_VOTE_TOKEN_MINT: '',
  STONK_VOTE_MIN_TOKENS: 0,
  // PAYOUT GATE (owner 2026-09-10): correct pickers are paid only if their
  // wallet holds at least STONK_HOLD_MIN_USD of STONK_HOLD_MINT (the stonkwars
  // coin) at settlement. Empty mint = falls back to STONK_BUYBACK_MINT.
  STONK_HOLD_MINT: '',
  STONK_HOLD_MIN_USD: 10,
};
