/*
Copyright 2015-2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { MemoryCryptoStore } from "./crypto/store/memory-crypto-store";
import { MemoryStore } from "./store/memory";
import { MatrixScheduler } from "./scheduler";
import { MatrixClient, ICreateClientOpts } from "./client";
import { DeviceTrustLevel } from "./crypto/CrossSigning";
import { ISecretStorageKeyInfo } from "./crypto/api";

export * from "./client";
export * from "./http-api";
export * from "./autodiscovery";
export * from "./sync-accumulator";
export * from "./errors";
export * from "./models/beacon";
export * from "./models/event";
export * from "./models/room";
export * from "./models/event-timeline";
export * from "./models/event-timeline-set";
export * from "./models/room-member";
export * from "./models/room-state";
export * from "./models/user";
export * from "./scheduler";
export * from "./filter";
export * from "./timeline-window";
export * from "./interactive-auth";
export * from "./service-types";
export * from "./store/memory";
export * from "./store/indexeddb";
export * from "./crypto/store/memory-crypto-store";
export * from "./crypto/store/indexeddb-crypto-store";
export * from "./content-repo";
export * from "./@types/event";
export * from "./@types/PushRules";
export * from "./@types/partials";
export * from "./@types/requests";
export * from "./@types/search";
export * from "./models/room-summary";
export * as ContentHelpers from "./content-helpers";
export { createNewMatrixCall } from "./webrtc/call";

let cryptoStoreFactory = () => new MemoryCryptoStore();

/**
 * Configure a different factory to be used for creating crypto stores
 *
 * @param {Function} fac  a function which will return a new
 *    {@link module:crypto.store.base~CryptoStore}.
 */
export function setCryptoStoreFactory(fac) {
    cryptoStoreFactory = fac;
}

export interface ICryptoCallbacks {
    getCrossSigningKey?: (keyType: string, pubKey: string) => Promise<Uint8Array>;
    saveCrossSigningKeys?: (keys: Record<string, Uint8Array>) => void;
    shouldUpgradeDeviceVerifications?: (users: Record<string, any>) => Promise<string[]>;
    getSecretStorageKey?: (
        keys: { keys: Record<string, ISecretStorageKeyInfo> },
        name: string,
    ) => Promise<[string, Uint8Array] | null>;
    cacheSecretStorageKey?: (keyId: string, keyInfo: ISecretStorageKeyInfo, key: Uint8Array) => void;
    onSecretRequested?: (
        userId: string,
        deviceId: string,
        requestId: string,
        secretName: string,
        deviceTrust: DeviceTrustLevel,
    ) => Promise<string>;
    getDehydrationKey?: (keyInfo: ISecretStorageKeyInfo, checkFunc: (key: Uint8Array) => void) => Promise<Uint8Array>;
    getBackupKey?: () => Promise<Uint8Array>;
}

/**
 * Construct a Matrix Client. Similar to {@link module:client.MatrixClient}
 * except that the 'request', 'store' and 'scheduler' dependencies are satisfied.
 * @param {(Object)} opts The configuration options for this client. If
 * this is a string, it is assumed to be the base URL. These configuration
 * options will be passed directly to {@link module:client.MatrixClient}.
 * @param {Object} opts.store If not set, defaults to
 * {@link module:store/memory.MemoryStore}.
 * @param {Object} opts.scheduler If not set, defaults to
 * {@link module:scheduler~MatrixScheduler}.
 *
 * @param {module:crypto.store.base~CryptoStore=} opts.cryptoStore
 *    crypto store implementation. Calls the factory supplied to
 *    {@link setCryptoStoreFactory} if unspecified; or if no factory has been
 *    specified, uses a default implementation (indexeddb in the browser,
 *    in-memory otherwise).
 *
 * @return {MatrixClient} A new matrix client.
 * @see {@link module:client.MatrixClient} for the full list of options for
 * <code>opts</code>.
 */
export function createClient(opts: ICreateClientOpts) {
    opts.store =
        opts.store ||
        new MemoryStore({
            localStorage: global.localStorage,
        });
    opts.scheduler = opts.scheduler || new MatrixScheduler();
    opts.cryptoStore = opts.cryptoStore || cryptoStoreFactory();
    return new MatrixClient(opts);
}

/**
 * A wrapper for the request function interface.
 * @callback requestWrapperFunction
 * @param {requestFunction} origRequest The underlying request function being
 * wrapped
 * @param {Object} opts The options for this HTTP request, given in the same
 * form as {@link requestFunction}.
 * @param {requestCallback} callback The request callback.
 */

/**
 * The request callback interface for performing HTTP requests. This matches the
 * API for the {@link https://github.com/request/request#requestoptions-callback|
 * request NPM module}. The SDK will implement a callback which meets this
 * interface in order to handle the HTTP response.
 * @callback requestCallback
 * @param {Error} err The error if one occurred, else falsey.
 * @param {Object} response The HTTP response which consists of
 * <code>{statusCode: {Number}, headers: {Object}}</code>
 * @param {Object} body The parsed HTTP response body.
 */
