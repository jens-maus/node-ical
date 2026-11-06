import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {describe, it} from 'mocha';
import ical from 'node-ical';

// Reading lines from the string and parsing them in batches (issues #219 and #476)

function vcalendar(lines, eol = '\r\n') {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join(eol);
}

function vevent(uid, ...properties) {
  return ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTART:20260105T100000Z', ...properties, 'END:VEVENT'];
}

function parseAsync(text) {
  return new Promise((resolve, reject) => {
    ical.parseICS(text, (error, data) => {
      if (error) {
        reject(error);
      } else {
        resolve(data);
      }
    });
  });
}

// A calendar with about 2,000 lines of filler before an event, so that the event's folded
// SUMMARY straddles the 2,000-line batch boundary of async parsing
function calendarWithFoldAtBatchBoundary(offset) {
  const filler = Array.from({length: 1993 + offset}, (_, index) => `X-FILLER:${index}`);
  return vcalendar([
    ...filler,
    ...vevent('boundary', 'SUMMARY:part1', ' part2', '\tpart3', ' part4'),
    ...vevent('after'),
  ]);
}

describe('line reading', () => {
  it('accepts LF, CRLF and mixed line endings', () => {
    const lines = vevent('eol', 'SUMMARY:Line endings');

    for (const text of [
      vcalendar(lines, '\n'),
      vcalendar(lines, '\r\n'),
      'BEGIN:VCALENDAR\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:eol\nDTSTART:20260105T100000Z\r\nSUMMARY:Line endings\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
    ]) {
      const event = ical.parseICS(text).eol;
      assert.equal(event.summary, 'Line endings');
      assert.equal(event.start.toISOString(), '2026-01-05T10:00:00.000Z');
    }
  });

  it('splits lines at LF with an optional CR before it, like the previous split(), also with stray CRs', () => {
    const text = vcalendar(vevent('cr', 'SUMMARY:a\rb', 'DESCRIPTION:c\r', 'LOCATION:d\r\r', 'COMMENT:e'), '\n') + '\r\n\n';
    const fromString = ical.parseICS(text);
    const fromLines = ical.parseLines(text.split(/\r?\n/v));

    assert.equal(JSON.stringify(fromString), JSON.stringify(fromLines));
    assert.equal(fromString.cr.description, 'c');
    assert.equal(fromString.cr.comment, 'e');
  });

  it('joins folded lines that continue with a space or a tab', () => {
    const event = ical.parseICS(vcalendar(vevent('folded', 'SUMMARY:Hello', ' wor', '\tld', 'DESCRIPTION:x', ' '))).folded;

    assert.equal(event.summary, 'Helloworld');
    assert.equal(event.description, 'x');
  });

  it('parses the same calendar from a string and from a line array', () => {
    const text = vcalendar([...vevent('a', 'SUMMARY:First', ' continued'), ...vevent('b', 'SUMMARY:Second')]);
    const fromString = ical.parseICS(text);
    const fromLines = ical.parseLines(text.split(/\r?\n/v));

    assert.deepEqual(Object.keys(fromString), Object.keys(fromLines));
    assert.equal(fromString.a.summary, 'Firstcontinued');
    assert.equal(fromLines.a.summary, 'Firstcontinued');
    assert.equal(fromString.b.start.toISOString(), fromLines.b.start.toISOString());
  });
});

describe('batched async parsing', () => {
  it('joins a folded line that straddles a batch boundary like sync parsing', async () => {
    for (const offset of [-2, -1, 0, 1, 2]) {
      const text = calendarWithFoldAtBatchBoundary(offset);
      // eslint-disable-next-line no-await-in-loop -- one calendar at a time keeps failures readable
      const asyncData = await parseAsync(text);

      assert.equal(asyncData.boundary.summary, 'part1part2part3part4', `offset ${offset}`);
      assert.equal(ical.parseICS(text).boundary.summary, 'part1part2part3part4', `offset ${offset}`);
      assert.ok(asyncData.after, `offset ${offset}`);
    }
  });

  it('never calls the callback synchronously', () => {
    let isCalled = false;
    ical.parseICS(vcalendar(vevent('x')), () => {
      isCalled = true;
    });

    assert.equal(isCalled, false);
  });

  it('yields to the event loop between batches', async () => {
    const text = vcalendar(Array.from({length: 1000}, (_, index) => vevent(`e${index}`)).flat());
    let isImmediateRun = false;
    const parsing = parseAsync(text);
    setImmediate(() => {
      isImmediateRun = true;
    });

    const data = await parsing;
    assert.equal(Object.values(data).filter(component => component.type === 'VEVENT').length, 1000);
    assert.equal(isImmediateRun, true, 'a callback queued during parsing should run before parsing ends');
  });

  it('reports an error from a later batch to the callback', async () => {
    const text = vcalendar([
      // 600 events of 4 lines each put the invalid event after the first 2,000-line batch
      ...Array.from({length: 600}, (_, index) => vevent(`e${index}`)).flat(),
      'BEGIN:VEVENT',
      'UID:bad',
      'DTSTART:not_a_date',
      'RRULE:FREQ=DAILY',
      'END:VEVENT',
    ]);

    await assert.rejects(() => parseAsync(text), /toISOString/v);
  });
});

describe('input type', () => {
  const text = vcalendar(vevent('x'));

  it('accepts a String object', () => {
    // eslint-disable-next-line no-new-wrappers, unicorn/new-for-builtins -- String objects worked before and still do
    assert.ok(ical.parseICS(new String(text)).x);
  });

  it('rejects a Buffer, an array and other non-strings with a TypeError', async () => {
    for (const input of [Buffer.from(text), [text], 42, null, undefined]) {
      assert.throws(() => ical.sync.parseICS(input), TypeError);
      // eslint-disable-next-line no-await-in-loop -- one input at a time keeps failures readable
      await assert.rejects(() => ical.async.parseICS(input), TypeError);
    }
  });
});

describe('parseLines()', () => {
  const lines = vcalendar([...vevent('a', 'SUMMARY:First'), ...vevent('b', 'SUMMARY:Second')]).split('\r\n');

  it('returns the data without a callback', () => {
    assert.equal(ical.parseLines(lines).b.summary, 'Second');
  });

  it('calls a callback synchronously without batching', () => {
    let result;
    ical.parseLines(lines, 0, undefined, undefined, 0, (error, data) => {
      assert.equal(error, null);
      result = data;
    });

    assert.equal(result.a.summary, 'First');
  });

  it('parses in batches with a callback', async () => {
    const data = await new Promise((resolve, reject) => {
      ical.parseLines(lines, 3, undefined, undefined, 0, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });

    assert.equal(data.a.summary, 'First');
    assert.equal(data.b.summary, 'Second');
  });

  it('starts at the given index', () => {
    const startOfSecondEvent = lines.indexOf('UID:b') - 1;
    const data = ical.parseLines(lines, 0, undefined, undefined, startOfSecondEvent);

    assert.equal(data.a, undefined);
    assert.equal(data.b.summary, 'Second');
  });

  it('passes an error to the callback once and still throws without one', () => {
    const badLines = vcalendar(['BEGIN:VEVENT', 'UID:bad', 'DTSTART:not_a_date', 'RRULE:FREQ=DAILY', 'END:VEVENT']).split('\r\n');
    const calls = [];
    ical.parseLines(badLines, 0, undefined, undefined, 0, (error, data) => {
      calls.push([error?.message, data]);
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0][0], /toISOString/v);
    assert.deepEqual(calls[0][1], {});
    assert.throws(() => ical.parseLines(badLines), /toISOString/v);
  });
});
