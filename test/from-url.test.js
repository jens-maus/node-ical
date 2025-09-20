const assert = require('node:assert');
const http = require('node:http');
const {describe, it} = require('mocha');
const ical = require('../node-ical.js');

const ICS_TEMPLATE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//TEST//node-ical fetch test//EN',
  'BEGIN:VEVENT',
  'UID:fetch-test-1',
  'DTSTAMP:20250101T000000Z',
  'DTSTART:20250101T100000Z',
  'DTEND:20250101T110000Z',
  'SUMMARY:Fetch Test Event',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function icsBody(summary) {
  return ICS_TEMPLATE.replace('Fetch Test Event', summary);
}

function getFirstVEvent(data) {
  return Object.values(data).find(object => object.type === 'VEVENT');
}

async function withServer(routeHandlers) {
  const handlerMap = new Map(Object.entries(routeHandlers).filter(([, fn]) => typeof fn === 'function'));

  const sockets = new Set();
  const server = http.createServer((request, response) => {
    server.keepAliveTimeout = 0;
    server.headersTimeout = 1000;

    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
      pathname = request.url;
    }

    let handler = handlerMap.get(pathname);
    if (typeof handler !== 'function') {
      const wildcard = handlerMap.get('*');
      if (typeof wildcard === 'function') {
        handler = wildcard;
      }
    }

    if (typeof handler === 'function') {
      handler(request, response);
      return;
    }

    response.writeHead(404, {'Content-Type': 'text/plain'});
    response.end('not found');
  });

  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise(resolve => {
    server.listen(0, resolve);
  });
  const {port} = server.address();
  const urlBase = `http://localhost:${port}`;

  return {
    urlBase,
    async close() {
      server.closeAllConnections?.();
      for (const socket of sockets) {
        try {
          if (!socket.destroyed) {
            socket.end();
          }
        } catch {}
      }

      await new Promise(resolve => {
        setTimeout(resolve, 25);
      });
      await new Promise(resolve => {
        server.close(resolve);
      });
    },
  };
}

describe('fromURL', () => {
  describe('Callback API', () => {
    it('returns parsed VEVENT on 200 (callback)', async () => {
      const {urlBase, close} = await withServer({
        '/ok.ics'(_request, response) {
          response.writeHead(200, {'Content-Type': 'text/calendar'});
          response.end(icsBody('Fetch Test Event'));
        },
      });

      await new Promise((resolve, reject) => {
        ical.fromURL(`${urlBase}/ok.ics`, {}, (error, data) => {
          if (error) {
            reject(error);
          } else {
            const event = getFirstVEvent(data);
            assert.ok(event);
            assert.equal(event.summary, 'Fetch Test Event');
            resolve();
          }
        });
      });

      await close();
    });
  });

  describe('Error handling', () => {
    it('yields error and null data on 404', async () => {
      const {urlBase, close} = await withServer({
        '/missing.ics'(_request, response) {
          response.writeHead(404, {'Content-Type': 'text/plain'});
          response.end('nope');
        },
      });

      await new Promise(resolve => {
        ical.fromURL(`${urlBase}/missing.ics`, {}, (error, data) => {
          assert.ok(error);
          assert.match(error.message, /404/);
          assert.equal(data, null);
          resolve();
        });
      });

      await close();
    });

    describe('Headers/options', () => {
      it('forwards headers to HTTP request', async () => {
        const {urlBase, close} = await withServer({
          '/secure.ics'(request, response) {
            if (request.headers['x-test-token'] === 'abc') {
              response.writeHead(200, {'Content-Type': 'text/calendar'});
              response.end(icsBody('Secured Event'));
            } else {
              response.writeHead(401, {'Content-Type': 'text/plain'});
              response.end('unauthorized');
            }
          },
        });

        await new Promise((resolve, reject) => {
          ical.fromURL(`${urlBase}/secure.ics`, {headers: {'X-Test-Token': 'abc'}}, (error, data) => {
            if (error) {
              reject(error);
            } else {
              const event = getFirstVEvent(data);
              assert.ok(event);
              assert.equal(event.summary, 'Secured Event');
              resolve();
            }
          });
        });

        await close();
      });
    });

    describe('Callback API', () => {
      it('supports callback without options and reports 404', async () => {
        const {urlBase, close} = await withServer({
          '/plain.ics'(_request, response) {
            response.writeHead(200, {'Content-Type': 'text/calendar'});
            response.end(icsBody('Callback No Options'));
          },
          '/missing.ics'(_request, response) {
            response.writeHead(404, {'Content-Type': 'text/plain'});
            response.end('missing');
          },
        });

        await new Promise((resolve, reject) => {
          ical.fromURL(`${urlBase}/plain.ics`, (error, data) => {
            if (error) {
              reject(error);
            } else {
              const event = getFirstVEvent(data);
              assert.ok(event);
              assert.equal(event.summary, 'Callback No Options');
              resolve();
            }
          });
        });

        await new Promise(resolve => {
          ical.fromURL(`${urlBase}/missing.ics`, (error, data) => {
            assert.ok(error);
            assert.match(error.message, /404/);
            assert.equal(data, null);
            resolve();
          });
        });

        await close();
      });
    });

    describe('Promise API', () => {
      it('resolves with parsed data (promise)', async () => {
        const {urlBase, close} = await withServer({
          '/promise.ics'(_request, response) {
            response.writeHead(200, {'Content-Type': 'text/calendar'});
            response.end(icsBody('Promise Event'));
          },
        });

        const data = await ical.fromURL(`${urlBase}/promise.ics`);
        const event = getFirstVEvent(data);
        assert.ok(event);
        assert.equal(event.summary, 'Promise Event');

        await close();
      });
    });
  });
});
