"use strict";
var sdk = require("../..");
var HttpBackend = require("../mock-request");
var utils = require("../test-utils");

var baseUrl = "http://localhost.or.something";
var userId = "@alice:localhost";
var userName = "Alice";
var accessToken = "aseukfgwef";
var roomId = "!foo:bar";
var otherUserId = "@bob:localhost";

var USER_MEMBERSHIP_EVENT = utils.mkMembership({
    room: roomId, mship: "join", user: userId, name: userName
});

var ROOM_NAME_EVENT = utils.mkEvent({
    type: "m.room.name", room: roomId, user: otherUserId,
    content: {
        name: "Old room name"
    }
});

var INITIAL_SYNC_DATA = {
    next_batch: "s_5_3",
    rooms: {
        join: {
            "!foo:bar": {  // roomId
                timeline: {
                    events: [
                        utils.mkMessage({
                            room: roomId, user: otherUserId, msg: "hello"
                        })
                    ],
                    prev_batch: "f_1_1"
                },
                state: {
                    events: [
                        ROOM_NAME_EVENT,
                        utils.mkMembership({
                            room: roomId, mship: "join",
                            user: otherUserId, name: "Bob"
                        }),
                        USER_MEMBERSHIP_EVENT,
                        utils.mkEvent({
                            type: "m.room.create", room: roomId, user: userId,
                            content: {
                                creator: userId
                            }
                        })
                    ]
                }
            }
        }
    }
};

var EVENTS = [
    utils.mkMessage({
        room: roomId, user: userId, msg: "we",
    }),
    utils.mkMessage({
        room: roomId, user: userId, msg: "could",
    }),
    utils.mkMessage({
        room: roomId, user: userId, msg: "be",
    }),
    utils.mkMessage({
        room: roomId, user: userId, msg: "heroes",
    }),
];

// start the client, and wait for it to initialise
function startClient(httpBackend, client) {
    httpBackend.when("GET", "/pushrules").respond(200, {});
    httpBackend.when("POST", "/filter").respond(200, { filter_id: "fid" });
    httpBackend.when("GET", "/sync").respond(200, INITIAL_SYNC_DATA);

    client.startClient();

    var syncstate;
    client.on("sync", function(state) {
        syncstate = state;
    });

    return httpBackend.flush().then(function() {
        expect(syncstate).toEqual("SYNCING");
    });
}


describe("getEventTimeline support", function() {
    var httpBackend;

    beforeEach(function() {
        utils.beforeEach(this);
        httpBackend = new HttpBackend();
        sdk.request(httpBackend.requestFn);
    });

    it("timeline support must be enabled to work", function(done) {
        var client = sdk.createClient({
            baseUrl: baseUrl,
            userId: userId,
            accessToken: accessToken,
        });

        startClient(httpBackend, client
        ).then(function() {
            var room = client.getRoom(roomId);
            expect(function() { client.getEventTimeline(room, "event"); })
                .toThrow();
        }).catch(exceptFail).done(done);
    });

    it("timeline support works when enabled", function(done) {
        var client = sdk.createClient({
            baseUrl: baseUrl,
            userId: userId,
            accessToken: accessToken,
            timelineSupport: true,
        });

        startClient(httpBackend, client
        ).then(function() {
            var room = client.getRoom(roomId);
            expect(function() { client.getEventTimeline(room, "event"); })
                .not.toThrow();
        }).catch(exceptFail).done(done);

        httpBackend.flush().catch(exceptFail);
    });


    it("scrollback should be able to scroll back to before a gappy /sync",
      function(done) {
        // need a client with timelineSupport disabled to make this work
        var client = sdk.createClient({
            baseUrl: baseUrl,
            userId: userId,
            accessToken: accessToken,
        });
        var room;

        startClient(httpBackend, client
        ).then(function() {
            room = client.getRoom(roomId);

            httpBackend.when("GET", "/sync").respond(200, {
                next_batch: "s_5_4",
                rooms: {
                    join: {
                        "!foo:bar": {
                            timeline: {
                                events: [
                                    EVENTS[0],
                                ],
                                prev_batch: "f_1_1",
                            },
                        },
                    },
                },
            });

            httpBackend.when("GET", "/sync").respond(200, {
                next_batch: "s_5_5",
                rooms: {
                    join: {
                        "!foo:bar": {
                            timeline: {
                                events: [
                                    EVENTS[1],
                                ],
                                limited: true,
                                prev_batch: "f_1_2",
                            },
                        },
                    },
                },
            });

            httpBackend.when("GET", "/messages").respond(200, {
                chunk: [EVENTS[0]],
                start: "pagin_start",
                end: "pagin_end",
            });


            return httpBackend.flush("/sync", 2);
        }).then(function() {
            expect(room.timeline.length).toEqual(1);
            expect(room.timeline[0].event).toEqual(EVENTS[1]);

            httpBackend.flush("/messages", 1);
            return client.scrollback(room);
        }).then(function() {
            expect(room.timeline.length).toEqual(2);
            expect(room.timeline[0].event).toEqual(EVENTS[0]);
            expect(room.timeline[1].event).toEqual(EVENTS[1]);
            expect(room.oldState.paginationToken).toEqual("pagin_end");
        }).catch(exceptFail).done(done);
    });
});

describe("MatrixClient event timelines", function() {
    var client, httpBackend;

    beforeEach(function(done) {
        utils.beforeEach(this);
        httpBackend = new HttpBackend();
        sdk.request(httpBackend.requestFn);

        client = sdk.createClient({
            baseUrl: baseUrl,
            userId: userId,
            accessToken: accessToken,
            timelineSupport: true,
        });

        startClient(httpBackend, client)
            .catch(exceptFail).done(done);
    });

    afterEach(function() {
        httpBackend.verifyNoOutstandingExpectation();
    });

    describe("getEventTimeline", function() {
        it("should create a new timeline for new events", function(done) {
            var room = client.getRoom(roomId);
            httpBackend.when("GET", "/rooms/!foo%3Abar/context/event1%3Abar")
                .respond(200, function() {
                    return {
                        start: "start_token",
                        events_before: [EVENTS[0]],
                        event: EVENTS[1],
                        events_after: [EVENTS[2]],
                        state: [
                            ROOM_NAME_EVENT,
                            USER_MEMBERSHIP_EVENT,
                        ],
                        end: "end_token",
                    };
                });

            client.getEventTimeline(room, "event1:bar").then(function(tl) {
                expect(tl.getEvents().length).toEqual(3);
                for (var i = 0; i < 3; i++) {
                    expect(tl.getEvents()[i].event).toEqual(EVENTS[i]);
                    expect(tl.getEvents()[i].sender.name).toEqual(userName);
                }
                expect(tl.getPaginationToken(true)).toEqual("start_token");
                expect(tl.getPaginationToken(false)).toEqual("end_token");
            }).catch(exceptFail).done(done);

            httpBackend.flush().catch(exceptFail);
        });

        it("should return existing timeline for known events", function(done) {
            var room = client.getRoom(roomId);
            httpBackend.when("GET", "/sync").respond(200, {
                next_batch: "s_5_4",
                rooms: {
                    join: {
                        "!foo:bar": {
                            timeline: {
                                events: [
                                    EVENTS[0],
                                ],
                                prev_batch: "f_1_2",
                            },
                        },
                    },
                },
            });

            httpBackend.flush("/sync").then(function() {
                return client.getEventTimeline(room, EVENTS[0].event_id);
            }).then(function(tl) {
                expect(tl.getEvents().length).toEqual(2);
                expect(tl.getEvents()[1].event).toEqual(EVENTS[0]);
                expect(tl.getEvents()[1].sender.name).toEqual(userName);
                expect(tl.getPaginationToken(true)).toEqual("f_1_1");
                // expect(tl.getPaginationToken(false)).toEqual("s_5_4");
            }).catch(exceptFail).done(done);

            httpBackend.flush().catch(exceptFail);
        });

        it("should update timelines where they overlap a previous /sync", function(done) {
            var room = client.getRoom(roomId);
            httpBackend.when("GET", "/sync").respond(200, {
                next_batch: "s_5_4",
                rooms: {
                    join: {
                        "!foo:bar": {
                            timeline: {
                                events: [
                                    EVENTS[3],
                                ],
                                prev_batch: "f_1_2",
                            },
                        },
                    },
                },
            });

            httpBackend.when("GET", "/rooms/!foo%3Abar/context/" +
                             encodeURIComponent(EVENTS[2].event_id))
                .respond(200, function() {
                    return {
                        start: "start_token",
                        events_before: [EVENTS[1]],
                        event: EVENTS[2],
                        events_after: [EVENTS[3]],
                        end: "end_token",
                        state: [],
                    };
                });


            httpBackend.flush("/sync").then(function() {
                return client.getEventTimeline(room, EVENTS[2].event_id);
            }).then(function(tl) {
                expect(tl.getEvents().length).toEqual(4);
                expect(tl.getEvents()[0].event).toEqual(EVENTS[1]);
                expect(tl.getEvents()[1].event).toEqual(EVENTS[2]);
                expect(tl.getEvents()[3].event).toEqual(EVENTS[3]);
                expect(tl.getPaginationToken(true)).toEqual("start_token");
                // expect(tl.getPaginationToken(false)).toEqual("s_5_4");
            }).catch(exceptFail).done(done);

            httpBackend.flush().catch(exceptFail);
        });

        it("should join timelines where they overlap a previous /context",
          function(done) {
            var room = client.getRoom(roomId);

            // we fetch event 0, then 2, then 3, and finally 1. 1 is returned
            // with context which joins them all up.
            httpBackend.when("GET", "/rooms/!foo%3Abar/context/" +
                             encodeURIComponent(EVENTS[0].event_id))
                .respond(200, function() {
                    return {
                        start: "start_token0",
                        events_before: [],
                        event: EVENTS[0],
                        events_after: [],
                        end: "end_token0",
                        state: [],
                    };
                });

            httpBackend.when("GET", "/rooms/!foo%3Abar/context/" +
                             encodeURIComponent(EVENTS[2].event_id))
                .respond(200, function() {
                    return {
                        start: "start_token2",
                        events_before: [],
                        event: EVENTS[2],
                        events_after: [],
                        end: "end_token2",
                        state: [],
                    };
                });

            httpBackend.when("GET", "/rooms/!foo%3Abar/context/" +
                             encodeURIComponent(EVENTS[3].event_id))
                .respond(200, function() {
                    return {
                        start: "start_token3",
                        events_before: [],
                        event: EVENTS[3],
                        events_after: [],
                        end: "end_token3",
                        state: [],
                    };
                });

            httpBackend.when("GET", "/rooms/!foo%3Abar/context/" +
                             encodeURIComponent(EVENTS[1].event_id))
                .respond(200, function() {
                    return {
                        start: "start_token4",
                        events_before: [EVENTS[0]],
                        event: EVENTS[1],
                        events_after: [EVENTS[2], EVENTS[3]],
                        end: "end_token4",
                        state: [],
                    };
                });

            var tl0, tl2, tl3;
            client.getEventTimeline(room, EVENTS[0].event_id
            ).then(function(tl) {
                expect(tl.getEvents().length).toEqual(1);
                tl0 = tl;
                return client.getEventTimeline(room, EVENTS[2].event_id);
            }).then(function(tl) {
                expect(tl.getEvents().length).toEqual(1);
                tl2 = tl;
                return client.getEventTimeline(room, EVENTS[3].event_id);
            }).then(function(tl) {
                expect(tl.getEvents().length).toEqual(1);
                tl3 = tl;
                return client.getEventTimeline(room, EVENTS[1].event_id);
            }).then(function(tl) {
                // we expect it to get merged in with event 2
                expect(tl.getEvents().length).toEqual(2);
                expect(tl.getEvents()[0].event).toEqual(EVENTS[1]);
                expect(tl.getEvents()[1].event).toEqual(EVENTS[2]);
                expect(tl.getNeighbouringTimeline(true)).toBe(tl0);
                expect(tl.getNeighbouringTimeline(false)).toBe(tl3);
                expect(tl0.getPaginationToken(true)).toEqual("start_token0");
                expect(tl0.getPaginationToken(false)).toBe(null);
                expect(tl3.getPaginationToken(true)).toBe(null);
                expect(tl3.getPaginationToken(false)).toEqual("end_token3");
            }).catch(exceptFail).done(done);

            httpBackend.flush().catch(exceptFail);
        });

        it("should fail gracefully if there is no event field", function(done) {
            var room = client.getRoom(roomId);
            // we fetch event 0, then 2, then 3, and finally 1. 1 is returned
            // with context which joins them all up.
            httpBackend.when("GET", "/rooms/!foo%3Abar/context/event1")
                .respond(200, function() {
                    return {
                        start: "start_token",
                        events_before: [],
                        events_after: [],
                        end: "end_token",
                        state: [],
                    };
                });

            client.getEventTimeline(room, "event1"
            ).then(function(tl) {
                // could do with a fail()
                expect(true).toBeFalsy();
            }).catch(function(e) {
                expect(String(e)).toMatch(/'event'/);
            }).catch(exceptFail).done(done);

            httpBackend.flush().catch(exceptFail);
        });
    });

    describe("paginateEventTimeline", function() {
        it("should allow you to paginate backwards", function(done) {
            var room = client.getRoom(roomId);

            httpBackend.when("GET", "/rooms/!foo%3Abar/context/" +
                             encodeURIComponent(EVENTS[0].event_id))
                .respond(200, function() {
                    return {
                        start: "start_token0",
                        events_before: [],
                        event: EVENTS[0],
                        events_after: [],
                        end: "end_token0",
                        state: [],
                    };
                });

            httpBackend.when("GET", "/rooms/!foo%3Abar/messages")
                .check(function(req) {
                    var params = req.queryParams;
                    expect(params.dir).toEqual("b");
                    expect(params.from).toEqual("start_token0");
                    expect(params.limit).toEqual(30);
                }).respond(200, function() {
                    return {
                        chunk: [EVENTS[1], EVENTS[2]],
                        end: "start_token1",
                    };
                });

            var tl;
            client.getEventTimeline(room, EVENTS[0].event_id
            ).then(function(tl0) {
                tl = tl0;
                return client.paginateEventTimeline(tl, {backwards: true});
            }).then(function(success) {
                expect(success).toBeTruthy();
                expect(tl.getEvents().length).toEqual(3);
                expect(tl.getEvents()[0].event).toEqual(EVENTS[2]);
                expect(tl.getEvents()[1].event).toEqual(EVENTS[1]);
                expect(tl.getEvents()[2].event).toEqual(EVENTS[0]);
                expect(tl.getPaginationToken(true)).toEqual("start_token1");
                expect(tl.getPaginationToken(false)).toEqual("end_token0");
            }).catch(exceptFail).done(done);

            httpBackend.flush().catch(exceptFail);
        });


        it("should allow you to paginate forwards", function(done) {
            var room = client.getRoom(roomId);

            httpBackend.when("GET", "/rooms/!foo%3Abar/context/" +
                             encodeURIComponent(EVENTS[0].event_id))
                .respond(200, function() {
                    return {
                        start: "start_token0",
                        events_before: [],
                        event: EVENTS[0],
                        events_after: [],
                        end: "end_token0",
                        state: [],
                    };
                });

            httpBackend.when("GET", "/rooms/!foo%3Abar/messages")
                .check(function(req) {
                    var params = req.queryParams;
                    expect(params.dir).toEqual("f");
                    expect(params.from).toEqual("end_token0");
                    expect(params.limit).toEqual(20);
                }).respond(200, function() {
                    return {
                        chunk: [EVENTS[1], EVENTS[2]],
                        end: "end_token1",
                    };
                });

            var tl;
            client.getEventTimeline(room, EVENTS[0].event_id
            ).then(function(tl0) {
                tl = tl0;
                return client.paginateEventTimeline(tl, {backwards: false, limit: 20});
            }).then(function(success) {
                expect(success).toBeTruthy();
                expect(tl.getEvents().length).toEqual(3);
                expect(tl.getEvents()[0].event).toEqual(EVENTS[0]);
                expect(tl.getEvents()[1].event).toEqual(EVENTS[1]);
                expect(tl.getEvents()[2].event).toEqual(EVENTS[2]);
                expect(tl.getPaginationToken(true)).toEqual("start_token0");
                expect(tl.getPaginationToken(false)).toEqual("end_token1");
            }).catch(exceptFail).done(done);

            httpBackend.flush().catch(exceptFail);
        });

    });
});

// make the test fail, with the given exception
function exceptFail(error) {
    expect(error.stack).toBe(null);
}
