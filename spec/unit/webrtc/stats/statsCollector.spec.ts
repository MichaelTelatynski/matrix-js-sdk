/*
Copyright 2023 The Matrix.org Foundation C.I.C.

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

import { StatsCollector } from "../../../../src/webrtc/stats/statsCollector";
import { StatsReportEmitter } from "../../../../src/webrtc/stats/statsReportEmitter";

const CALL_ID = "CALL_ID";
const USER_ID = "USER_ID";

describe("StatsCollector", () => {
    let collector: StatsCollector;
    let rtcSpy: RTCPeerConnection;
    let emitter: StatsReportEmitter;
    beforeEach(() => {
        rtcSpy = { getStats: () => new Promise<RTCStatsReport>(() => null) } as RTCPeerConnection;
        rtcSpy.addEventListener = jest.fn();
        emitter = new StatsReportEmitter();
        collector = new StatsCollector(CALL_ID, USER_ID, rtcSpy, emitter);
    });

    describe("on process stats", () => {
        it("if active calculate stats reports", async () => {
            const getStats = jest.spyOn(rtcSpy, "getStats");
            getStats.mockResolvedValue({} as RTCStatsReport);
            await collector.processStats("GROUP_CALL_ID", "LOCAL_USER_ID");
            expect(getStats).toHaveBeenCalled();
        });

        it("if not active do not calculate stats reports", async () => {
            collector.setActive(false);
            const getStats = jest.spyOn(rtcSpy, "getStats");
            await collector.processStats("GROUP_CALL_ID", "LOCAL_USER_ID");
            expect(getStats).not.toHaveBeenCalled();
        });

        it("if get reports fails, the collector becomes inactive", async () => {
            expect(collector.getActive()).toBeTruthy();
            const getStats = jest.spyOn(rtcSpy, "getStats");
            getStats.mockRejectedValue(new Error("unknown"));
            await collector.processStats("GROUP_CALL_ID", "LOCAL_USER_ID");
            expect(getStats).toHaveBeenCalled();
            expect(collector.getActive()).toBeFalsy();
        });

        it("if active an RTCStatsReport not a promise the collector becomes inactive", async () => {
            const getStats = jest.spyOn(rtcSpy, "getStats");
            // @ts-ignore
            getStats.mockReturnValue({});
            const actual = await collector.processStats("GROUP_CALL_ID", "LOCAL_USER_ID");
            expect(actual).toBeFalsy();
            expect(getStats).toHaveBeenCalled();
            expect(collector.getActive()).toBeFalsy();
        });
    });
});
