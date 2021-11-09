const ical = require('../node-ical.js');

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

ical.fromURL('https://raw.githubusercontent.com/jens-maus/node-ical/master/test/test6.ics', {}, (error, data) => {
  if (error) {
    console.log(new Error('ERROR: ' + error));
  } else {
    for (const k in data) {
      if (!{}.hasOwnProperty.call(data, k)) {
        continue;
      }

      const ev = data[k];
      if (data[k].type === 'VEVENT') {
        console.log(
          `${ev.summary} is in ${ev.location} on the ${ev.start.getDate()} of ${
            months[ev.start.getMonth()]
          } at ${ev.start.toLocaleTimeString('en-GB')}`
        );
      }
    }
  }
});
