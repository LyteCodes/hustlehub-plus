'use strict';

/**
 * HIBP Pwned Passwords k-anonymity check.
 * https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange
 */

const crypto = require('crypto');

const PWNED_RANGE_URL = 'https://api.pwnedpasswords.com/range/';

/**
 * Returns how many times the password appears in known breach corpuses.
 * Returns 0 if not found. Throws if the HIBP API returns a non-2xx status.
 *
 * @param {string} password 
 * @returns {Promise<number>}
 */
async function checkPwnedPassword(password) {
  const sha1   = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const res = await fetch(`${PWNED_RANGE_URL}${prefix}`, {
    headers: { 'Add-Padding': 'true' },
  });

  if (!res.ok) throw new Error(`HIBP API responded with ${res.status}`);

  const body = await res.text();
  for (const line of body.split('\r\n')) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    if (line.slice(0, sep) === suffix) return parseInt(line.slice(sep + 1), 10);
  }
  return 0;
}

module.exports = { checkPwnedPassword };
