/**
 * Build the exported node-ical API object.
 * Keeping this in one helper reduces drift between entrypoint wrappers.
 *
 * @param {object} options
 * @param {object} options.asyncApi
 * @param {object} options.autodetectApi
 * @param {object} options.syncApi
 * @param {(event: object, options: object) => Array<object>} options.expandRecurringEvent
 * @param {object} options.icalCore
 * @returns {object} Public API object exposed by the package entry points.
 */
function buildPublicApi({asyncApi, autodetectApi, syncApi, expandRecurringEvent, icalCore}) {
  return {
    // Autodetect
    fromURL: asyncApi.fromURL,
    parseFile: autodetectApi.parseFile,
    parseICS: autodetectApi.parseICS,
    // Sync
    sync: syncApi,
    // Async
    async: asyncApi,
    // Recurring event expansion
    expandRecurringEvent,
    // Other backwards compat things
    objectHandlers: icalCore.objectHandlers,
    handleObject: icalCore.handleObject,
    parseLines: icalCore.parseLines,
  };
}

export {buildPublicApi};
