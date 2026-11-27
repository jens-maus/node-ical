import process from 'node:process';

// The autodetect parseICS()/parseFile() switch to async mode when given a callback (#476).
// That mode is deprecated in favor of the explicit async and sync APIs.
const CALLBACK_DEPRECATIONS = {
  parseICS: 'NODE_ICAL_PARSEICS_CALLBACK',
  parseFile: 'NODE_ICAL_PARSEFILE_CALLBACK',
};

/**
 * Build core parse/fetch APIs shared by CJS and ESM entrypoints.
 *
 * @param {object} options
 * @param {(ics: string, cb?: (error: Error | null, parsedData: object) => void) => object | void} options.parseICSImpl - Calendar parser function.
 * @param {object} options.fsModule - fs module implementation.
 * @param {(url: string, options?: object) => Promise<{ok: boolean, status: number, statusText: string, text: () => Promise<string>}>} [options.fetchImpl] - Fetch implementation (defaults to global fetch).
 * @param {(message: string, options: {type: string, code: string}) => void} [options.emitWarning] - Warning emitter (defaults to process.emitWarning).
 * @returns {{
 *   syncApi: object,
 *   asyncApi: object,
 *   autodetectApi: object,
 *   fromURL: (...args: Array<unknown>) => unknown,
 *   parseFile: (...args: Array<unknown>) => unknown,
 *   parseICS: (...args: Array<unknown>) => unknown,
 * }} Shared API object parts.
 */
function createCoreApi({
  parseICSImpl,
  fsModule,
  fetchImpl = fetch,
  emitWarning = (message, options) => {
    process.emitWarning(message, options);
  },
}) {
  const shownDeprecations = new Set();

  // Warn once per function, like Node.js does for its own deprecations
  function warnCallbackDeprecated(name) {
    if (shownDeprecations.has(name)) {
      return;
    }

    shownDeprecations.add(name);
    emitWarning(
      `Calling ${name}() with a callback is deprecated and will stop working in node-ical 1.0. `
      + `Use ical.async.${name}() for a Promise or a callback, or ical.sync.${name}() for a direct result.`,
      {type: 'DeprecationWarning', code: CALLBACK_DEPRECATIONS[name]},
    );
  }

  // Bridge promise-based internals to callback APIs while preserving callback error behavior.
  function promiseCallback(promise, callback) {
    if (!callback) {
      return promise;
    }

    const callCallback = (error, result) => {
      try {
        callback(error, result);
      } catch (callbackError) {
        queueMicrotask(() => {
          throw callbackError;
        });
      }
    };

    promise
      .then(returnValue => {
        callCallback(null, returnValue);
      })
      .catch(error => {
        callCallback(error, null);
      });
  }

  function parseICSAsync(data) {
    return new Promise((resolve, reject) => {
      parseICSImpl(data, (error, parsedData) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(parsedData);
      });
    });
  }

  async function parseFileAsync(filename) {
    const data = await fsModule.promises.readFile(filename, 'utf8');
    return parseICSAsync(data);
  }

  async function fromURLAsync(url, options) {
    const fetchOptions = (options && typeof options === 'object') ? {...options} : {};
    const response = await fetchImpl(url, fetchOptions);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const data = await response.text();
    return parseICSAsync(data);
  }

  const syncApi = {};
  const asyncApi = {};
  const autodetectApi = {};

  asyncApi.fromURL = function (url, options, callback) {
    if (typeof options === 'function' && callback === undefined) {
      callback = options;
      options = undefined;
    }

    return promiseCallback(fromURLAsync(url, options), callback);
  };

  asyncApi.parseFile = function (filename, callback) {
    return promiseCallback(parseFileAsync(filename), callback);
  };

  asyncApi.parseICS = function (data, callback) {
    return promiseCallback(parseICSAsync(data), callback);
  };

  syncApi.parseFile = function (filename) {
    const data = fsModule.readFileSync(filename, 'utf8');
    return parseICSImpl(data);
  };

  syncApi.parseICS = function (data) {
    return parseICSImpl(data);
  };

  autodetectApi.parseFile = function (filename, callback) {
    if (!callback) {
      return syncApi.parseFile(filename);
    }

    warnCallbackDeprecated('parseFile');
    asyncApi.parseFile(filename, callback);
  };

  autodetectApi.parseICS = function (data, callback) {
    if (!callback) {
      return syncApi.parseICS(data);
    }

    warnCallbackDeprecated('parseICS');
    asyncApi.parseICS(data, callback);
  };

  const {fromURL} = asyncApi;
  const {parseFile, parseICS} = autodetectApi;

  return {
    syncApi,
    asyncApi,
    autodetectApi,
    fromURL,
    parseFile,
    parseICS,
  };
}

export {createCoreApi};
