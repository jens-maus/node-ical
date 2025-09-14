/**
 * Additional tests for fromURL().
 * These focus on HTTP success, error status handling, header passthrough and promise usage.
 */

const http = require('node:http');
const assert = require('node:assert');
const vows = require('vows');
const ical = require('../node-ical.js');

const ICS_BODY = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//TEST//node-ical fetch test//EN\nBEGIN:VEVENT\nUID:fetch-test-1\nDTSTAMP:20250101T000000Z\nDTSTART:20250101T100000Z\nDTEND:20250101T110000Z\nSUMMARY:Fetch Test Event\nEND:VEVENT\nEND:VCALENDAR';

function withServer(routeHandlers, run) {
  // Ensure a clean dictionary without prototype pollution risk
  if (Object.getPrototypeOf(routeHandlers) !== null) {
    routeHandlers = Object.assign(Object.create(null), routeHandlers);
  }

  const server = http.createServer((request, res) => {
    // Normalize URL to pathname only (ignore query/fragments)
    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
      pathname = request.url; // Fallback (unlikely in tests)
    }

    let handler;
    if (Object.prototype.hasOwnProperty.call(routeHandlers, pathname)) {
      handler = routeHandlers[pathname];
    } else if (Object.prototype.hasOwnProperty.call(routeHandlers, '*')) {
      handler = routeHandlers['*'];
    }

    if (typeof handler === 'function') {
      handler(request, res);
    } else {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end('not found');
    }
  });
  server.listen(0, () => {
    const {port} = server.address();
    const urlBase = `http://localhost:${port}`;
    run({server, port, urlBase}, () => server.close());
  });
}

vows
  .describe('fromURL via native fetch')
  .addBatch({
    'successful fetch (callback)': {
      topic() {
        withServer(
          {
            '/ok.ics'(request, res) {
              res.writeHead(200, {'Content-Type': 'text/calendar'});
              res.end(ICS_BODY);
            },
          },
          ({urlBase}, done) => {
            ical.fromURL(`${urlBase}/ok.ics`, {}, (error, data) => {
              done();
              this.callback(error, data);
            });
          },
        );
      },
      'parses VEVENT'(error, data) {
        assert.ifError(error);
        const ev = Object.values(data).find(e => e.type === 'VEVENT');
        assert.ok(ev, 'No VEVENT parsed');
        assert.equal(ev.summary, 'Fetch Test Event');
      },
    },

    '404 status produces error': {
      topic() {
        withServer(
          {
            '/missing.ics'(request, res) {
              res.writeHead(404, {'Content-Type': 'text/plain'});
              res.end('nope');
            },
          },
          ({urlBase}, done) => {
            ical.fromURL(`${urlBase}/missing.ics`, {}, (error, data) => {
              done();
              this.callback(error, data);
            });
          },
        );
      },
      'passes an error to callback'(error, data) {
        assert.ok(error, 'Expected error for 404');
        assert.match(error.message, /404/);
        assert.equal(data, null);
      },
    },

    'headers are passed through': {
      topic() {
        withServer(
          {
            '/secure.ics'(request, res) {
              if (request.headers['x-test-token'] === 'abc') {
                res.writeHead(200, {'Content-Type': 'text/calendar'});
                res.end(ICS_BODY.replace('Fetch Test Event', 'Secured Event'));
              } else {
                res.writeHead(401, {'Content-Type': 'text/plain'});
                res.end('unauthorized');
              }
            },
          },
          ({urlBase}, done) => {
            ical.fromURL(
              `${urlBase}/secure.ics`,
              {headers: {'X-Test-Token': 'abc'}},
              (error, data) => {
                done();
                this.callback(error, data);
              },
            );
          },
        );
      },
      'authorized fetch succeeds'(error, data) {
        assert.ifError(error);
        const ev = Object.values(data).find(e => e.type === 'VEVENT');
        assert.ok(ev);
        assert.equal(ev.summary, 'Secured Event');
      },
    },

    'callback usage without options argument': {
      topic() {
        withServer(
          {
            '/plain.ics'(request, res) {
              res.writeHead(200, {'Content-Type': 'text/calendar'});
              res.end(ICS_BODY.replace('Fetch Test Event', 'Callback No Options'));
            },
            '/plain-missing.ics'(request, res) {
              res.writeHead(404, {'Content-Type': 'text/plain'});
              res.end('missing');
            },
          },
          ({urlBase}, done) => {
            // Use legacy style: fromURL(url, cb)
            ical.fromURL(`${urlBase}/plain.ics`, (error, data) => {
              done();
              this.callback(error, data);
            });
          },
        );
      },
      'works and parses event'(error, data) {
        assert.ifError(error);
        const ev = Object.values(data).find(e => e.type === 'VEVENT');
        assert.ok(ev, 'No VEVENT');
        assert.equal(ev.summary, 'Callback No Options');
      },
      '404 without options yields error': {
        topic() {
          withServer(
            {
              '/missing.ics'(request, res) {
                res.writeHead(404, {'Content-Type': 'text/plain'});
                res.end('nope');
              },
            },
            ({urlBase}, done) => {
              ical.fromURL(`${urlBase}/missing.ics`, (error, data) => {
                done();
                this.callback(error, data);
              });
            },
          );
        },
        'returns error object'(error, data) {
          assert.ok(error, 'Expected error');
          assert.match(error.message, /404/);
          assert.equal(data, null);
        },
      },
    },

    'promise usage (no callback)': {
      topic() {
        withServer(
          {
            '/promise.ics'(request, res) {
              res.writeHead(200, {'Content-Type': 'text/calendar'});
              res.end(ICS_BODY.replace('Fetch Test Event', 'Promise Event'));
            },
          },
          ({urlBase}, done) => {
            ical
              .fromURL(`${urlBase}/promise.ics`)
              .then(data => {
                done();
                this.callback(null, data);
              })
              .catch(error => {
                done();
                this.callback(error, null);
              });
          },
        );
      },
      'returns parsed data'(error, data) {
        assert.ifError(error);
        const ev = Object.values(data).find(e => e.type === 'VEVENT');
        assert.ok(ev, 'No VEVENT found');
        assert.equal(ev.summary, 'Promise Event');
      },
    },
  })
  .export(module);
