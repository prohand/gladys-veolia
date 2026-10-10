// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the only surface the integration relies on and records every
// call so tests can assert them. `devices` plays the SDK's list of the devices
// the user created; `failStates` makes the next publishStates call throw.
// -----------------------------------------------------------------------------

export function createFakeGladys() {
  return {
    devices: [],
    discovered: [],
    stateCalls: [],
    sceneEvents: [],
    connectionStatuses: [],
    widgetRefreshes: [],
    failStates: false,

    externalIds(type, platformId) {
      const device = `ext:veolia:${type}:${platformId}`;
      return {
        device,
        feature: (key) => `${device}:${key}`,
      };
    },

    async publishDiscoveredDevices(devices) {
      this.discovered.push(devices);
    },

    async publishStates(states) {
      if (this.failStates) {
        this.failStates = false;
        throw new Error('Gladys unavailable');
      }
      this.stateCalls.push(states);
    },

    async publishSceneEvent(key, data = {}) {
      this.sceneEvents.push({ key, data });
      return { success: true };
    },

    async setConnectionStatus(connected, message) {
      this.connectionStatuses.push({ connected, message });
    },

    requestWidgetRefresh(key) {
      this.widgetRefreshes.push(key);
    },

    // Every state published so far, flattened.
    get published() {
      return this.stateCalls.flat();
    },

    // Simulate the user adding every discovered device.
    createAllDevices() {
      this.devices = (this.discovered.at(-1) ?? []).map((d) => ({ external_id: d.external_id }));
    },
  };
}
