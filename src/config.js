// All Stonk Wars knobs. No secrets here — keys live in .env (see .env.example).
module.exports = {
  PORT: Number(process.env.PORT) || 3737,

  // --- the tournament ---
  STONK_START_USD: 1000,               // every animal starts with this (paper money)
  // one hour per round; all matches in a round run at once. Env overrides
  // exist so a rehearsal can run with 3-minute rounds: STONK_MATCH_MS=180000
  STONK_MATCH_MS: Number(process.env.STONK_MATCH_MS) || 20 * 60_000, // owner 2026-09-12: 20 minutes of trading per match, one match at a time
  STONK_INTERMISSION_MS: Number(process.env.STONK_INTERMISSION_MS) || 5 * 60_000, // owner 2026-09-10: 5-minute bell between rounds
  STONK_AUTO_RESTART: true,         // owner 2026-09-12: when a champion is crowned the next tournament starts by itself, fresh random bracket
  STONK_RESTART_DELAY_MS: 60_000,   // champion celebration before the next pregame (then STONK_PREGAME_MS of promo before the bell)
  // X AUTO-POSTER (owner 2026-09-13): a card with both contestants, their stats and the winner crowned. Posts only when the
  // X app keys are in .env (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET); otherwise dry-run into data/xposts/.
  STONK_XPOST: 'final',             // 'final' = the final only (~4/day, free tier) | 'sf' | 'match' (needs a paid tier) | 'champion' | 'off'
  STONK_XPOST_MONTHLY_CAP: 450,     // hard stop per calendar month (X free tier); raise if the app is on Basic
  STONK_XPOST_SITE: 'https://stonkwars.org',
  STONK_MATCH_GAP_MS: process.env.STONK_MATCH_GAP_MS != null ? Number(process.env.STONK_MATCH_GAP_MS) : 60_000,       // breather between consecutive matches of a round (the desk previews the next one)
  STONK_BUST_USD: 30,                 // equity at/under this = busted, match lost immediately
  STONK_PICK_WINDOW_MS: 5 * 60_000,   // owner 2026-09-10: picks for a match stay open until 5 minutes into it (a third of the 15-minute match, as 20/60 was)
  STONK_SETTLE_PER_MATCH: false,    // owner 2026-09-13: payouts no longer depend on picks — holders are paid directly (see STONK_HOLDER_AIRDROP)
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
  STONK_BANTER_MS: 0,               // owner 2026-09-13 FREE MODE: 0 = scripted lines only, no API call
  STONK_CHAT_REPLY_MS: 0,           // owner 2026-09-13 FREE MODE: the desk no longer answers stream chat (that was an API call each time)
  STONK_CHAT_MODEL: 'claude-haiku-4-5-20251001', // owner 2026-09-13 (cost): Haiku answers chat — was Opus 5, ~20x the price for one line
  // DESK AGENTS (owner 2026-09-10): each Stonks Man is its own Claude agent that reads the
  // events, the transcript and the chat and decides when to speak. Needs ANTHROPIC_API_KEY.
  STONK_AGENTS: false,              // owner 2026-09-13 FREE MODE: the two autonomous comedians are OFF. Set true to bring them back
                                    // (leave the three knobs above at 0 — the agents do banter, interviews and chat themselves).
  STONK_AGENT_MODEL: 'claude-haiku-4-5-20251001', // owner 2026-09-13 (cost): the desk runs on Haiku — Opus 5 was ~$170/day of one-liners
  STONK_AGENT_TICK_MS: 20_000,       // owner 2026-09-13: a seat takes a turn this often (was 12s; ~40% fewer calls and less talking over each other)
  STONK_PREGAME_MS: Number(process.env.STONK_PREGAME_MS) || 5 * 60_000,     // owner 2026-09-10: 5-minute pregame (video -> intros -> banter)
  STONK_INTRO_GAP_MS: 15_000,       // one contender introduced this often during the pregame (16 x 15s = 4 min)
  STONK_INTERVIEW_MS: 0,            // owner 2026-09-13 FREE MODE: ringside interviews were an API call each
  STONK_BANTER_MODEL: 'claude-haiku-4-5-20251001', // cheap and fast; four hours costs cents
  STONK_LINE_GAP_MS: 3500,          // a commentator will not talk over itself faster than this
  // VOICES. Edge (msedge-tts) is free and unlimited; ElevenLabs bills per character and the show burned 181k/day.
  // '' = Edge for every line (free, the default). 'all' = ElevenLabs for every line. A comma list = the paid voice
  // only for those line kinds, e.g. 'result,champion,round,interview' keeps it for the moments that carry the show.
  STONK_EL_KINDS: '',

  // --- TREASURY (owner 2026-09-10): claim fees -> buy the coin -> pay winners IN the coin ---
  // Per round: claim all pump.fun creator fees; swap STONK_BUYBACK_PCT of them
  // into STONK_BUYBACK_MINT; send STONK_WINNER_SHARE of the coin bought, split
  // evenly, to the correct pickers. LIVE needs STONK_TREASURY_ENABLED true and
  // STONK_PAYOUT_KEY = the DEV (creator) wallet key — the claim must be signed
  // by the creator. Otherwise it dry-runs and records what it would have done.
  STONK_TREASURY_ENABLED: false,
  // owner 2026-09-10: "buy back its OWN token and pay out in it, not $PRO" — paste the
  // STONK WARS coin mint here at launch. Empty = no buyback; settlements are recorded as owed.
  STONK_BUYBACK_MINT: 'Eg4eG7B1VjajeHbmFRBo3uTP37BbCZrFyqZpsL75pump', // the STONK WARS coin, relaunched 2026-09-10 (creator = dev wallet 4HukHCev…; the first coin AJ273Xah… is retired)
  STONK_COIN_SYMBOL: 'STONK',       // ticker shown on the site until the mint is set (then Dexscreener's symbol wins)
  STONK_BUYBACK_PCT: 0,             // owner 2026-09-14: no buybacks either
  STONK_WINNER_SHARE: 0.5,          // half of the coin bought goes to the correct pickers
  STONK_SWAP_SLIPPAGE_BPS: 300,     // 3% on the Jupiter swap
  // PRIZE TOKEN + PARTNER (owner 2026-09-12, "option A"): of each match's claimed fees F —
  //   50% stays as SOL (reserve); STONK_PARTNER_SHARE of that reserve (25% => 12.5% of F) is sent to STONK_PARTNER_WALLET
  //   25% buys STONK_BUYBACK_MINT (the project's own coin, kept by the project)
  //   25% buys STONK_PRIZE_MINT (the prize token), airdropped in full to the correct pickers; with no eligible pickers
  //   that 25% buys the own coin instead. Empty STONK_PRIZE_MINT = the old flow (pickers get STONK_WINNER_SHARE of the own coin).
  //   The prize token's address is never published by the site (owner's request).
  STONK_PRIZE_MINT: '',             // owner 2026-09-14: no prize token is bought — there are no payouts at all now
  STONK_PRIZE_SYMBOL: 'STONK',
  STONK_BUYBACK_SPLIT: 0.5,         // share of the buyback pool (STONK_BUYBACK_PCT of F) that buys the own coin; the rest buys the prize token
  STONK_PARTNER_WALLET: '',         // owner 2026-09-14: cleared so nothing can be sent there by accident (was BrPV21YM…P3oz)
  STONK_PARTNER_SHARE: 0,           // retired: this was a share of the old SOL reserve. The split below is a share of TOTAL fees.
  // FEE SPLIT (owner 2026-09-13) — of every batch of creator fees claimed: 50% owner / 25% partner / 25% holders.
  // The holder slice buys STONK_PRIZE_MINT and is airdropped to every holder of the project's coin at or above
  // STONK_HOLDER_MIN_TOKENS, weighted by how much they hold. No picking and no wallet connect required.
  // The owner's 50% and the partner's 25% are plain SOL. No buybacks of the project's own coin.
  STONK_HOLDER_AIRDROP: true,       // kept ON as the fee COLLECTOR only: with the two percentages at 0 it just claims
                                    // every creator fee into the dev wallet at the end of a tournament and sends nothing out.
  STONK_AIRDROP_PCT: 0,             // owner 2026-09-14: "keep all 100% of the fees" — holders get nothing. >0 turns the airdrop back on.
  STONK_PARTNER_PCT: 0,             // owner 2026-09-14: partner cut off. >0 turns it back on.
  STONK_HOLDER_MIN_TOKENS: 5_000_000,
  STONK_AIRDROP_EVERY: 'tournament', // 'tournament' (once per bracket) | 'round' | 'match'
  STONK_AIRDROP_EXCLUDE: '',        // extra wallets to skip; the dev wallet and every off-curve owner (pools, curves) are skipped already
  STONK_TREASURY_MIN_SOL: 0.01,     // skip the round if unclaimed fees are below this
  STONK_CLAIM_PRIORITY_FEE: 0.00005,
  STONK_CLAIM_MS: 0,                 // 0 = fees are claimed once, at round settlement (owner 2026-09-10: "keep it at once per round"); >0 = sweep every N ms

  // Sybil brakes (default off). Gate on holding the project token once it exists.
  STONK_VOTE_MIN_SOL: 0,
  STONK_VOTE_TOKEN_MINT: '',
  STONK_VOTE_MIN_TOKENS: 0,
  // PAYOUT GATE (owner 2026-09-10): correct pickers are paid only if their
  // wallet holds at least STONK_HOLD_MIN_USD of STONK_HOLD_MINT (the stonkwars
  // coin) at settlement. Empty mint = falls back to STONK_BUYBACK_MINT.
  STONK_HOLD_MINT: '',
  STONK_HOLD_MIN_USD: 0,
  STONK_HOLD_MIN_TOKENS: 1_000_000, // owner 2026-09-13: hold at least 1 million $STONK to collect airdrops (was 5M)
};
