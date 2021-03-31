/** **
 * Tests
 *
 *
 ** */
process.env.TZ = 'America/San_Francisco';

const assert = require('assert');
const vows = require('vows');
const _ = require('underscore');
const ical = require('../node-ical');
const moment = require('moment-timezone');

vows
  .describe('node-ical')
  .addBatch({
    'when parsing test1.ics (node conferences schedule from lanyrd.com, modified)': {
      topic() {
        return ical.parseFile('./test/test1.ics');
      },

      'we get 9 events'(topic) {
        const events = _.select(_.values(topic), x => {
          return x.type === 'VEVENT';
        });
        assert.equal(events.length, 9);
      },

      'event 47f6e': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === '47f6ea3f28af2986a2192fa39a91fa7d60d26b76';
          })[0];
        },
        'is in fort lauderdale'(topic) {
          assert.equal(topic.location, 'Fort Lauderdale, United States');
        },
        'starts Tue, 29 Nov 2011'(topic) {
          assert.equal(topic.start.toDateString(), new Date(2011, 10, 29).toDateString());
        },
        'datetype is date'(topic) {
          assert.equal(topic.datetype, 'date');
        }
      },
      'event 480a': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === '480a3ad48af5ed8965241f14920f90524f533c18';
          })[0];
        },
        'has a summary (invalid colon handling tolerance)'(topic) {
          assert.equal(topic.summary, '[Async]: Everything Express');
        },
        'has a date only start datetime'(topic) {
          assert.equal(topic.start.dateOnly, true);
        },
        'has a date only end datetime'(topic) {
          assert.equal(topic.end.dateOnly, true);
        }
      },
      'event d4c8': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === 'd4c826dfb701f611416d69b4df81caf9ff80b03a';
          })[0];
        },
        'has a start datetime'(topic) {
          assert.equal(topic.start.toDateString(), new Date(Date.UTC(2011, 2, 12, 20, 0, 0)).toDateString());
        },
        'datetype is date-time'(topic) {
          assert.equal(topic.datetype, 'date-time');
        }
      },

      'event sdfkf09fsd0 (Invalid Date)': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === 'sdfkf09fsd0';
          })[0];
        },
        'has a start datetime'(topic) {
          assert.equal(topic.start, 'Next Year');
        }
      }
    },
    'with test2.ics (testing ical features)': {
      topic() {
        return ical.parseFile('./test/test2.ics');
      },
      'todo item uid4@host1.com': {
        topic(items) {
          return _.find(items, object => {
            return object.uid === 'uid4@host1.com';
          });
        },
        'is a VTODO'(topic) {
          assert.equal(topic.type, 'VTODO');
        }
      },
      vfreebusy: {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.type === 'VFREEBUSY';
          })[0];
        },
        'has a URL'(topic) {
          assert.equal(topic.url, 'http://www.host.com/calendar/busytime/jsmith.ifb');
        }
      },
      'vfreebusy first freebusy': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.type === 'VFREEBUSY';
          })[0].freebusy[0];
        },
        'has undefined type defaulting to busy'(topic) {
          assert.equal(topic.type, 'BUSY');
        },
        'has an start datetime'(topic) {
          assert.equal(topic.start.getFullYear(), 1998);
          assert.equal(topic.start.getUTCMonth(), 2);
          assert.equal(topic.start.getUTCDate(), 14);
          assert.equal(topic.start.getUTCHours(), 23);
          assert.equal(topic.start.getUTCMinutes(), 30);
        },
        'has an end datetime'(topic) {
          assert.equal(topic.end.getFullYear(), 1998);
          assert.equal(topic.end.getUTCMonth(), 2);
          assert.equal(topic.end.getUTCDate(), 15);
          assert.equal(topic.end.getUTCHours(), 0);
          assert.equal(topic.end.getUTCMinutes(), 30);
        }
      },
      'tzid parsing': {
        topic(events) {
          return _.find(events, object => {
            return object.uid === 'EC9439B1-FF65-11D6-9973-003065F99D04';
          });
        },
        'tzid offset correctly applied'(event) {
          const start = new Date('2002-10-28T22:00:00.000Z');
          assert.equal(event.start.valueOf(), start.valueOf());
        }
      }
    },
    'with test3.ics (testing tvcountdown.com)': {
      topic() {
        return ical.parseFile('./test/test3.ics');
      },
      'event -83': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === '20110505T220000Z-83@tvcountdown.com';
          })[0];
        },
        'has a start datetime'(topic) {
          assert.equal(topic.start.getFullYear(), 2011);
          assert.equal(topic.start.getMonth(), 4);
        },
        'has an end datetime'(topic) {
          assert.equal(topic.end.getFullYear(), 2011);
          assert.equal(topic.end.getMonth(), 4);
        },
        'datetype is date-time'(topic) {
          assert.equal(topic.datetype, 'date-time');
        }
      }
    },

    'with test4.ics (testing tripit.com)': {
      topic() {
        return ical.parseFile('./test/test4.ics');
      },
      'event c32a5...': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === 'c32a5eaba2354bb29e012ec18da827db90550a3b@tripit.com';
          })[0];
        },
        'has a start datetime'(topic) {
          assert.equal(topic.start.getFullYear(), 2011);
          assert.equal(topic.start.getMonth(), 9);
          assert.equal(topic.start.getDate(), 11);
        },

        'has a summary'(topic) {
          // Escaped commas and semicolons should be replaced
          assert.equal(topic.summary, 'South San Francisco, CA, October 2011;');
        },

        'has a description'(topic) {
          const desired =
            'John Doe is in South San Francisco, CA from Oct 11 ' +
            'to Oct 13, 2011\nView and/or edit details in TripIt : http://www.tripit.c' +
            'om/trip/show/id/23710889\nTripIt - organize your travel at http://www.trip' +
            'it.com\n';
          assert.equal(topic.description, desired);
        },

        'has a geolocation'(topic) {
          assert.ok(topic.geo, 'no geo param');
          assert.equal(topic.geo.lat, 37.654656);
          assert.equal(topic.geo.lon, -122.40775);
        },

        'has transparency'(topic) {
          assert.equal(topic.transparency, 'TRANSPARENT');
        }
      }
    },

    'with test5.ics (testing meetup.com)': {
      topic() {
        return ical.parseFile('./test/test5.ics');
      },
      'event nsmxnyppbfc@meetup.com': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === 'event_nsmxnyppbfc@meetup.com';
          })[0];
        },
        'has a start'(topic) {
          assert.equal(topic.start.tz, 'America/Phoenix');
          assert.equal(topic.start.toISOString(), new Date(Date.UTC(2011, 10, 10, 2, 0, 0)).toISOString());
        }
      }
    },

    'with test6.ics (testing assembly.org)': {
      topic() {
        return ical.parseFile('./test/test6.ics');
      },
      'event with no ID': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.summary === 'foobar Summer 2011 starts!';
          })[0];
        },
        'has a start'(topic) {
          assert.equal(topic.start.toISOString(), new Date(2011, 7, 4, 0, 0, 0).toISOString());
        }
      },
      'event with rrule': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.summary === 'foobarTV broadcast starts';
          })[0];
        },
        'Has an RRULE'(topic) {
          assert.notEqual(topic.rrule, undefined);
        },
        'RRule text'(topic) {
          assert.equal(topic.rrule.toText(), 'every 5 weeks on Monday, Friday until January 30, 2013');
        }
      }
    },
    'with test7.ics (testing dtstart of rrule)': {
      topic() {
        return ical.parseFile('./test/test7.ics');
      },
      'recurring yearly event (14 july)': {
        topic(events) {
          const ev = _.values(events)[0];
          return ev.rrule.between(new Date(2013, 0, 1), new Date(2014, 0, 1));
        },
        'dt start well set'(topic) {
          assert.equal(topic[0].toDateString(), new Date(2013, 6, 14).toDateString());
        }
      }
    },
    'with test 8.ics (VTODO completion)': {
      topic() {
        return ical.parseFile('./test/test8.ics');
      },
      'grabbing VTODO task': {
        topic(topic) {
          return _.values(topic)[0];
        },
        'task completed'(task) {
          assert.equal(task.completion, 100);
          assert.equal(task.completed.toISOString(), new Date(2013, 6, 16, 10, 57, 45).toISOString());
        }
      }
    },
    'with test 9.ics (VEVENT with VALARM)': {
      topic() {
        return ical.parseFile('./test/test9.ics');
      },
      'grabbing VEVENT task': {
        topic(topic) {
          return _.values(topic)[0];
        },
        'task completed'(task) {
          assert.equal(task.summary, 'Event with an alarm');
        }
      }
    },
    'with test 11.ics (VEVENT with custom properties)': {
      topic() {
        return ical.parseFile('./test10.ics');
      },
      'grabbing custom properties': {
        topic() {}
      }
    },

    'with test10.ics': {
      topic() {
        return ical.parseFile('./test/test10.ics');
      },

      'when categories present': {
        topic(t) {
          return _.values(t)[0];
        },

        'should be a list'(event) {
          assert(event.categories instanceof [].constructor);
        },

        'should contain individual category values'(event) {
          assert.deepEqual(event.categories, ['cat1', 'cat2', 'cat3']);
        }
      },

      'when categories present with trailing whitespace': {
        topic(t) {
          return _.values(t)[1];
        },

        'should contain individual category values without whitespace'(event) {
          assert.deepEqual(event.categories, ['cat1', 'cat2', 'cat3']);
        }
      },

      'when categories present but empty': {
        topic(t) {
          return _.values(t)[2];
        },

        'should be an empty list'(event) {
          assert.deepEqual(event.categories, []);
        }
      },

      'when categories present but singular': {
        topic(t) {
          return _.values(t)[3];
        },

        'should be a list of single item'(event) {
          assert.deepEqual(event.categories, ['lonely-cat']);
        }
      },

      'when categories present on multiple lines': {
        topic(t) {
          return _.values(t)[4];
        },

        'should contain the category values in an array'(event) {
          assert.deepEqual(event.categories, ['cat1', 'cat2', 'cat3']);
        }
      }
    },

    'with test11.ics (testing zimbra freebusy)': {
      topic() {
        return ical.parseFile('./test/test11.ics');
      },

      'freebusy params': {
        topic(events) {
          return _.values(events)[0];
        },
        'has a URL'(topic) {
          assert.equal(topic.url, 'http://mail.example.com/yvr-2a@example.com/20140416');
        },
        'has an ORGANIZER'(topic) {
          assert.equal(topic.organizer, 'mailto:yvr-2a@example.com');
        },
        'has an start datetime'(topic) {
          assert.equal(topic.start.getFullYear(), 2014);
          assert.equal(topic.start.getMonth(), 3);
        },
        'has an end datetime'(topic) {
          assert.equal(topic.end.getFullYear(), 2014);
          assert.equal(topic.end.getMonth(), 6);
        }
      },
      'freebusy busy events': {
        topic(events) {
          return _.select(_.values(events)[0].freebusy, x => {
            return x.type === 'BUSY';
          })[0];
        },
        'has an start datetime'(topic) {
          assert.equal(topic.start.getFullYear(), 2014);
          assert.equal(topic.start.getMonth(), 3);
          assert.equal(topic.start.getUTCHours(), 15);
          assert.equal(topic.start.getUTCMinutes(), 15);
        },
        'has an end datetime'(topic) {
          assert.equal(topic.end.getFullYear(), 2014);
          assert.equal(topic.end.getMonth(), 3);
          assert.equal(topic.end.getUTCHours(), 19);
          assert.equal(topic.end.getUTCMinutes(), 0);
        }
      }
    },

    'with test12.ics (testing recurrences and exdates)': {
      topic() {
        return ical.parseFile('./test/test12.ics');
      },
      'event with rrule': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === '0000001';
          })[0];
        },
        'Has an RRULE'(topic) {
          assert.notEqual(topic.rrule, undefined);
        },
        'Has summary Treasure Hunting'(topic) {
          assert.equal(topic.summary, 'Treasure Hunting');
        },
        'Has two EXDATES'(topic) {
          assert.notEqual(topic.exdate, undefined);
          assert.notEqual(
            topic.exdate[new Date(Date.UTC(2015, 6, 8, 19, 0, 0)).toISOString().slice(0, 10)],
            undefined
          );
          assert.notEqual(
            topic.exdate[new Date(Date.UTC(2015, 6, 10, 19, 0, 0)).toISOString().slice(0, 10)],
            undefined
          );
        },
        'Has a RECURRENCE-ID override'(topic) {
          assert.notEqual(topic.recurrences, undefined);
          assert.notEqual(
            topic.recurrences[new Date(Date.UTC(2015, 6, 7, 19, 0, 0)).toISOString().slice(0, 10)],
            undefined
          );
          assert.equal(
            topic.recurrences[new Date(Date.UTC(2015, 6, 7, 19, 0, 0)).toISOString().slice(0, 10)].summary,
            'More Treasure Hunting'
          );
        }
      }
    },

    'with test13.ics (testing recurrence-id before rrule)': {
      topic() {
        return ical.parseFile('./test/test13.ics');
      },
      'event with rrule': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === '6m2q7kb2l02798oagemrcgm6pk@google.com';
          })[0];
        },
        'Has an RRULE'(topic) {
          assert.notEqual(topic.rrule, undefined);
        },
        'Has summary "repeated"'(topic) {
          assert.equal(topic.summary, 'repeated');
        },
        'Has a RECURRENCE-ID override'(topic) {
          assert.notEqual(topic.recurrences, undefined);
          assert.notEqual(
            topic.recurrences[new Date(Date.UTC(2016, 7, 26, 11, 0, 0)).toISOString().slice(0, 10)],
            undefined
          );
          assert.equal(
            topic.recurrences[new Date(Date.UTC(2016, 7, 26, 11, 0, 0)).toISOString().slice(0, 10)].summary,
            'bla bla'
          );
        }
      }
    },

    'with test14.ics (testing comma-separated exdates)': {
      topic() {
        return ical.parseFile('./test/test14.ics');
      },
      'event with comma-separated exdate': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === '98765432-ABCD-DCBB-999A-987765432123';
          })[0];
        },
        'Has summary "Example of comma-separated exdates"'(topic) {
          assert.equal(topic.summary, 'Example of comma-separated exdates');
        },
        'Has four comma-separated EXDATES'(topic) {
          assert.notEqual(topic.exdate, undefined);
          // Verify the four comma-separated EXDATES are there
          assert.notEqual(topic.exdate[new Date(2017, 6, 6, 12, 0, 0).toISOString().slice(0, 10)], undefined);
          assert.notEqual(topic.exdate[new Date(2017, 6, 17, 12, 0, 0).toISOString().slice(0, 10)], undefined);
          assert.notEqual(topic.exdate[new Date(2017, 6, 20, 12, 0, 0).toISOString().slice(0, 10)], undefined);
          assert.notEqual(topic.exdate[new Date(2017, 7, 3, 12, 0, 0).toISOString().slice(0, 10)], undefined);
          // Verify an arbitrary date isn't there
          assert.equal(topic.exdate[new Date(2017, 4, 5, 12, 0, 0).toISOString().slice(0, 10)], undefined);
        }
      }
    },

    'with test14.ics (testing exdates with bad times)': {
      topic() {
        return ical.parseFile('./test/test14.ics');
      },
      'event with exdates with bad times': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === '1234567-ABCD-ABCD-ABCD-123456789012';
          })[0];
        },
        'Has summary "Example of exdate with bad times"'(topic) {
          assert.equal(topic.summary, 'Example of exdate with bad times');
        },
        'Has two EXDATES even though they have bad times'(topic) {
          assert.notEqual(topic.exdate, undefined);
          // Verify the two EXDATES are there, even though they have bad times
          assert.notEqual(topic.exdate[new Date(2017, 11, 18, 12, 0, 0).toISOString().slice(0, 10)], undefined);
          assert.notEqual(topic.exdate[new Date(2017, 11, 19, 12, 0, 0).toISOString().slice(0, 10)], undefined);
        }
      }
    },

    'with test15.ics (testing Microsoft Exchange Server 2010 with timezones)': {
      topic() {
        return ical.parseFile('./test/test15.ics');
      },
      'event with start and end including timezones': {
        topic(events) {
          return _.select(_.values(events), x => {
            return (
              x.uid ===
              '040000008200E00074C5B7101A82E00800000000C9AB6E5A6AFED401000000000000000010000000C55132227F0F0948A7D58F6190A3AEF9'
            );
          })[0];
        },
        'has a start'(topic) {
          assert.equal(topic.start.tz, '(UTC+07:00) Bangkok, Hanoi, Jakarta');
          assert.equal(topic.end.toISOString().slice(0, 8), new Date(Date.UTC(2019, 3, 30, 9, 0, 0)).toISOString().slice(0, 8));
          assert.equal(topic.end.tz, '(UTC+07:00) Bangkok, Hanoi, Jakarta');
          assert.equal(topic.end.toISOString().slice(0, 8), new Date(2019, 3, 30, 5, 0, 0).toISOString().slice(0, 8));
        }
      }
    },

    'with test16.ics (testing quoted parameter values)': {
      topic() {
        return ical.parseFile('./test/test16.ics');
      },
      'quoted params': {
        topic(events) {
          return _.values(events)[0];
        },
        'is quoted'(topic) {
          assert.notEqual(topic.start.tz, undefined);
        }
      }
    },

    'with test17.ics (testing for non-stringified start/end time)': {
      topic() {
        return ical.parseFile('./test/test17.ics');
      },
      'stringified params': {
        topic(events) {
          return _.values(events)[0];
        },
        'is not string'(topic) {
          assert.notEqual(typeof topic.start, 'string');
          assert.notEqual(typeof topic.end, 'string');
        }
      }
    },

    'with test18.ics (testing for detecting timezones)': {
      topic() {
        return ical.parseFile('./test/test18.ics');
      },
      'we get 5 events'(topic) {
        const events = _.select(_.values(topic), x => {
          return x.type === 'VEVENT';
        });
        assert.equal(events.length, 5);
      },

      'event 1c943': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === '1C9439B1-FF65-11D6-9973-003065F99D04';
          })[0];
        },
        'datetype is date-time'(topic) {
          assert.equal(topic.datetype, 'date-time');
        },
        'has no timezone'(topic) {
          assert.equal(topic.start.tz, undefined);
        },
        'starts 28 Oct 2002 @ 01:20:30 (Local Time)'(topic) {
          assert.equal(topic.start.toISOString(), new Date(2002, 9, 28, 1, 20, 30).toISOString());
        }
      },

      'event 2c943': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === '2C9439B1-FF65-11D6-9973-003065F99D04';
          })[0];
        },
        'datetype is date-time'(topic) {
          assert.equal(topic.datetype, 'date-time');
        },
        'has UTC timezone'(topic) {
          assert.equal(topic.start.tz, 'Etc/UTC');
        },
        'starts 28 Oct 2002 @ 01:20:30 (UTC)'(topic) {
          assert.equal(topic.start.toISOString(), '2002-10-28T01:20:30.000Z');
        }
      },

      'event 3c943': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === '3C9439B1-FF65-11D6-9973-003065F99D04';
          })[0];
        },
        'datetype is date-time'(topic) {
          assert.equal(topic.datetype, 'date-time');
        },
        'has New_York timezone'(topic) {
          assert.equal(topic.start.tz, 'America/New_York');
        },
        'starts 28 Oct 2002 @ 06:20:30 (UTC)'(topic) {
          assert.equal(topic.start.toISOString(), '2002-10-28T06:20:30.000Z');
        }
      },

      'event 4c943': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === '4C9439B1-FF65-11D6-9973-003065F99D04';
          })[0];
        },
        'datetype is date'(topic) {
          assert.equal(topic.datetype, 'date');
        },
        'has no timezone'(topic) {
          assert.equal(topic.start.tz, undefined);
        },
        'starts 28 Oct 2002 @ 00:00:00 (Local Time)'(topic) {
          assert.equal(topic.start.toISOString(), new Date(2002, 9, 28).toISOString());
        }
      },

      'event 5c943': {
        topic(events) {
          return _.select(_.values(events), x => {
            return x.uid === '5C9439B1-FF65-11D6-9973-003065F99D04';
          })[0];
        },
        'datetype is date'(topic) {
          assert.equal(topic.datetype, 'date');
        },
        'has no timezone'(topic) {
          assert.equal(topic.start.tz, undefined);
        },
        'starts 28 Oct 2002 @ 00:00:00 (Local Time)'(topic) {
          assert.equal(topic.start.toISOString(), new Date(2002, 9, 28).toISOString());
        }
      }
    },

    'with ms_timezones.ics (testing time conversions)': {
      'topic'() {
        return ical.parseFile('./test/ms_timezones.ics');
      },
      'event with time in CET': {
        'topic'(events) {
          return _.select(_.values(events), x => {
            return x.summary === 'Log Yesterday\'s Jira time';
          })[0];
        },
        'Has summary \'Log Yesterday\'s Jira time\''(topic) {
          assert.equal(topic.summary, 'Log Yesterday\'s Jira time');
        },
        'Has proper start and end dates and times'(topic) {
          // DTSTART;TZID=W. Europe Standard Time:20200609T090000
          assert.equal(topic.start.getFullYear(), 2020);
          assert.equal(topic.start.getMonth(), 5);
          assert.equal(topic.start.getUTCHours(), 7);
          assert.equal(topic.start.getUTCMinutes(), 0);
          // DTEND;TZID=W. Europe Standard Time:20200609T093000
          assert.equal(topic.end.getFullYear(), 2020);
          assert.equal(topic.end.getMonth(), 5);
          assert.equal(topic.end.getUTCHours(), 7);
          assert.equal(topic.end.getUTCMinutes(), 30);
        }
      }
    },

    'with bad_ms_tz.ics (testing for unexpected ms timezone)': {
      topic() {
        return ical.parseFile('./test/bad_ms_tz.ics');
      },
      'event with bad TZ': {
        'topic'(events) {
          return _.select(_.values(events), x => {
            return x.summary === '[private]';
          })[0];
        },
        'is not valid timezone'(topic) {
          assert.equal(topic.start.tz, 'Customized Time Zone');
        }
      }
    },

    'with Office-2012-owa.ics (testing for old ms timezones before DST)': {
      topic() {
        return ical.parseFile('./test/Office-2012-owa.ics');
      },
      'event with old TZ': {
        'topic'(events) {
          return _.select(_.values(events), x => {
            return x.summary === ' TEST';
          })[0];
        },
        'is not valid timezone'(topic) {
          assert.equal(topic.end.toISOString().slice(0, 8), new Date(Date.UTC(2020, 9, 28, 15, 0, 0)).toISOString().slice(0, 8));
        }
      }
    },

    'with Office-2012-owa.ics (testing for old ms timezones after DST )': {
      topic() {
        return ical.parseFile('./test/Office-2012-owa.ics');
      },
      'event with old TZ': {
        'topic'(events) {
          return _.select(_.values(events), x => {
            return x.summary === ' TEST 3';
          })[0];
        },
        'is not valid timezone'(topic) {
          assert.equal(topic.end.toISOString().slice(0, 8), new Date(Date.UTC(2020, 10, 2, 20, 0, 0)).toISOString().slice(0, 8));
        }
      }
    },

    'with bad_custom_ms_tz.ics (TZID="tzone://Microsoft/Custom")': {
      topic() {
        return ical.parseFile('./test/bad_custom_ms_tz.ics');
      },
      'event with old TZ': {
        'topic'(events) {
          return _.select(_.values(events), x => {
            return x.summary === '[private]';
          })[0];
        },
        'is not valid timezone'(topic) {
          assert.equal(topic.start.toISOString().slice(0, 8), new Date(Date.UTC(2021, 2, 25, 10, 35, 0)).toISOString().slice(0, 8));
        }
      }
    },
    'with bad_custom_ms_tz.ics-no-end (testing for no end, but set same as start )': {
      topic() {
        return ical.parseFile('./test/bad_custom_ms_tz.ics');
      },
      'event with old TZ': {
        'topic'(events) {
          return _.select(_.values(events), x => {
            return x.summary === '*masked-away*';
          })[0];
        },
        'is not valid timezone'(topic) {
          assert.equal(topic.end.toISOString().slice(0, 8), topic.start.toISOString().slice(0, 8));
        }
      }
    },
    'with bad_custom_ms_tz.ics-duration (testing for no end, but negative duration)': {
      topic() {
        return ical.parseFile('./test/bad_custom_ms_tz.ics');
      },
      'event with old TZ': {
        'topic'(events) {
          return _.select(_.values(events), x => {
            return x.summary === '*masked-away2*';
          })[0];
        },
        'is not valid timezone'(topic) {
          assert.equal(topic.end.toISOString().slice(0, 8), new Date(Date.UTC(2021, 2, 23, 21, 56, 56)).toISOString().slice(0, 8));
        }
      }
    },
    'bad rrule': {
      topic() {
        return ical.parseFile('./test/badRRULE.ics');
      },
      'is valid time': {
        'topic'(events) {
          return _.select(_.values(events), x => {
            return x.summary === 'Academic Time';
          })[0];
        },
        'is not valid date'(topic) {
          assert.equal(topic.start.toISOString().slice(11), '15:50:00.000Z');
        }
      }
    },

    'with forward.ics (testing for full day forward of UTC )': {
      topic() {
        moment.tz.setDefault('Europe/Berlin');
        return ical.parseFile('./test/test_with_forward_TZ.ics');
      },
      'event with east TZ': {
        'topic'(events) {
          return _.select(_.values(events), x => {
            return x.summary === 'Fear TWD';
          })[0];
        },
        'is not valid date'(topic) {
          assert.equal(topic.start.toISOString().slice(11), '00:00:00.000Z');
        }
      }
    },

    'url request errors': {
      topic() {
        ical.fromURL('http://255.255.255.255/', {}, this.callback);
      },
      'are passed back to the callback'(error, result) {
        assert.instanceOf(error, Error);
        if (!error) {
          console.log('>E:', error, result);
        }
      }
    }
  })
  .export(module);
