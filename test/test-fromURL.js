/**
 * Additional tests for fromURL().
 * These focus on HTTP success, error status handling, header passthrough and promise usage.
 */

const http = require('node:http');
const assert = require('node:assert');
const vows = require('vows');
const ical = require('../node-ical.js');

const ICS_BODY = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//TEST//node-ical fetch test//EN\nBEGIN:VEVENT\nUID:fetch-test-1\nDTSTAMP:20250101T000000Z\nDTSTART:20250101T100000Z\nDTEND:20250101T110000Z\nSUMMARY:Fetch Test Event\nEND:VEVENT\nEND:VCALENDAR';

function eventBody(summary) {
  return ICS_BODY.replace('Fetch Test Event', summary);
}

function getFirstVEvent(data) {
  return Object.values(data).find(e => e.type === 'VEVENT');
}

function withServer(routeHandlers, run) {
  // Map only function handlers (avoid dynamic property lookups)
  const handlerMap = new Map(
    Object.entries(routeHandlers).filter(([, fn]) => typeof fn === 'function'),
  );

  const server = http.createServer((req, res) => {
    // Reduce flakiness on Windows/Node by avoiding keep-alive lingering
    server.keepAliveTimeout = 0;
    server.headersTimeout = 1000;

    // Get pathname (ignore query/hash); fall back to raw req.url if URL ctor fails.
    const pathname = (() => {
      try {
        return new URL(req.url, 'http://localhost').pathname;
      } catch {
        return req.url;
      }
    })();

    const handler = handlerMap.get(pathname) || handlerMap.get('*');
    if (handler) {
      handler(req, res);
      return;
    }

    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end('not found');
  });

  // Track sockets for graceful shutdown
  const sockets = new Set();
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  server.listen(0, () => {
    const {port} = server.address();
    const urlBase = `http://localhost:${port}`;
    run({server, port, urlBase}, () => {
      // Graceful shutdown (Windows/Node24): stop new conns, end existing, delay close
      server.closeAllConnections?.();
      for (const s of sockets) {
        try {
          if (!s.destroyed) {
            s.end();
          }
        } catch {}
      }

      setTimeout(() => server.close(), 25);
    });
  });
}

vows
  .describe('fromURL via native fetch')
  .addBatch({
    'successful fetch (callback)': {
      topic() {
        withServer(
          {
            '/ok.ics'(_request, res) {
              res.writeHead(200, {'Content-Type': 'text/calendar'});
              res.end(eventBody('Fetch Test Event'));
            },
          },
          ({urlBase}, done) => {
            ical.fromURL(`${urlBase}/ok.ics`, {}, (error, data) => {
              this.callback(error, data);
              done();
            });
          },
        );
      },
      'parses VEVENT'(error, data) {
        assert.ifError(error);
        const ev = getFirstVEvent(data);
        assert.ok(ev, 'No VEVENT parsed');
        assert.strictEqual(ev.summary, 'Fetch Test Event');
      },
    },

    '404 status produces error': {
      topic() {
        withServer(
          {
            '/missing.ics'(_request, res) {
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
        assert.strictEqual(data, null);
      },
    },

    'headers are passed through': {
      topic() {
        withServer(
          {
            '/secure.ics'(request, res) {
              if (request.headers['x-test-token'] === 'abc') {
                res.writeHead(200, {'Content-Type': 'text/calendar'});
                res.end(eventBody('Secured Event'));
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
        const ev = getFirstVEvent(data);
        assert.ok(ev);
        assert.strictEqual(ev.summary, 'Secured Event');
      },
    },

    'callback usage without options argument': {
      topic() {
        withServer(
          {
            '/plain.ics'(_request, res) {
              res.writeHead(200, {'Content-Type': 'text/calendar'});
              res.end(eventBody('Callback No Options'));
            },
            '/plain-missing.ics'(_request, res) {
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
        const ev = getFirstVEvent(data);
        assert.ok(ev, 'No VEVENT');
        assert.strictEqual(ev.summary, 'Callback No Options');
      },
      '404 without options yields error': {
        topic() {
          withServer(
            {
              '/missing.ics'(_request, res) {
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
          assert.strictEqual(data, null);
        },
      },
    },

    'promise usage (no callback)': {
      topic() {
        withServer(
          {
            '/promise.ics'(_request, res) {
              res.writeHead(200, {'Content-Type': 'text/calendar'});
              res.end(eventBody('Promise Event'));
            },
          },
          ({urlBase}, done) => {
            (async () => {
              try {
                const data = await ical.fromURL(`${urlBase}/promise.ics`);
                done();
                this.callback(null, data);
              } catch (error) {
                done();
                this.callback(error, null);
              }
            })();
          },
        );
      },
      'returns parsed data'(error, data) {
        assert.ifError(error);
        const ev = getFirstVEvent(data);
        assert.ok(ev, 'No VEVENT found');
        assert.strictEqual(ev.summary, 'Promise Event');
      },
    },
  })
  .addBatch({
    'teardown fetch dispatcher': {
      topic() {
        (async () => {
          try {
            const dispatcher = globalThis.__undici_global__?.dispatcher || globalThis.dispatcher;
            if (dispatcher && typeof dispatcher.close === 'function') {
              // Force close to release any keep-alive sockets on Windows/Node24
              await dispatcher.close();
            }

            // Allow extra time for libuv to settle (Windows timing); 60ms empirically safe
            setTimeout(() => this.callback(null, true), 60);
          } catch {
            this.callback(null, true); // Never fail teardown
          }
        })();
      },
      'dispatcher closed'(err, ok) {
        assert.ifError(err);
        assert.strictEqual(ok, true);
      }
    }
  })
  .export(module);
