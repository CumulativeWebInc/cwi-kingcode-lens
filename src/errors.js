/**
 * errors.js — KingCode Lens shared error type.
 *
 * AdapterError is the single error type thrown across all adapters and the
 * state machine. `code` is machine-readable; `adapter` names the origin.
 */
export class AdapterError extends Error {
  /**
   * @param {string} message human-readable reason
   * @param {string} [code='ADAPTER_FAILURE'] one of:
   *   NOT_IMPLEMENTED | NOT_CONNECTED | INVALID_FRAME | ILLEGAL_TRANSITION |
   *   ADAPTER_FAILURE | TIMEOUT | BROWSER_ONLY
   * @param {string|null} [adapter=null] adapter name, e.g. 'android-xr'
   */
  constructor(message, code = 'ADAPTER_FAILURE', adapter = null) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.adapter = adapter;
  }
}
