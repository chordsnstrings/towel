import { hashToken } from "./auth.js";

// All function instances share one atomic counter; restarts do not reset it.
export class LoginLimitStore {
  constructor(db) {
    this.db = db;
    this.localKeys = false;
  }
  init(options) {
    this.windowMs = options.windowMs;
  }
  async increment(key) {
    const { rows } = await this.db.query(
      `INSERT INTO login_limits(key_hash,hits,reset_at)
       VALUES ($1,1,NOW()+($2 * INTERVAL '1 millisecond'))
       ON CONFLICT(key_hash) DO UPDATE SET
         hits=CASE WHEN login_limits.reset_at<=NOW() THEN 1 ELSE login_limits.hits+1 END,
         reset_at=CASE WHEN login_limits.reset_at<=NOW() THEN EXCLUDED.reset_at ELSE login_limits.reset_at END
       RETURNING hits,reset_at`,
      [hashToken(key), this.windowMs],
    );
    return { totalHits: rows[0].hits, resetTime: new Date(rows[0].reset_at) };
  }
  async decrement(key) {
    await this.db.query(
      "UPDATE login_limits SET hits=GREATEST(0,hits-1) WHERE key_hash=$1",
      [hashToken(key)],
    );
  }
  async resetKey(key) {
    await this.db.query("DELETE FROM login_limits WHERE key_hash=$1", [
      hashToken(key),
    ]);
  }
}
