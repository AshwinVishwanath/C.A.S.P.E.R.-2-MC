import { useState, useEffect, useCallback } from 'react';

/**
 * Default CAC command state -- no command in progress.
 */
function makeDefaultState() {
  return {
    busy: false,
    command_type: null,
    target_channel: null,
    error: null,
    nack_code: null,
    retry_count: 0,
  };
}

/**
 * useCommand -- hook for Command-Arm-Confirm (CAC) machine state.
 *
 * Subscribes to window.casper.on_cac_update() to track the current command
 * lifecycle (busy, type, target channel, errors, retries).
 *
 * Provides an abort() helper that calls window.casper.cmd_abort() to cancel
 * the current in-flight command.
 *
 * If window.casper is not available (dev mode outside Electron), returns a
 * static default state.
 *
 * @returns {object} { busy, command_type, target_channel, error, nack_code, retry_count, abort }
 */
export default function useCommand() {
  var [state, setState] = useState(makeDefaultState);

  useEffect(function () {
    if (typeof window === 'undefined' || !window.casper) return;

    var unsub = window.casper.on_cac_update(function (cacState) {
      if (!cacState) return;
      setState({
        busy: !!cacState.busy,
        command_type: cacState.command_type != null ? cacState.command_type : null,
        target_channel: cacState.target_channel != null ? cacState.target_channel : null,
        error: cacState.error != null ? cacState.error : null,
        nack_code: cacState.nack_code != null ? cacState.nack_code : null,
        retry_count: cacState.retry_count != null ? cacState.retry_count : 0,
      });
    });

    return function () {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  /**
   * Abort the current in-flight CAC command.
   */
  var abort = useCallback(function () {
    if (typeof window === 'undefined' || !window.casper) return;
    window.casper.cmd_abort();
  }, []);

  return { ...state, abort: abort };
}
