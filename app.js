var gpio = require('./pi-gpio');
var colors = require('colors');

var redOn = 0;
var greenOn = 0;
var blueOn = 0;
var redPin = 11;
var greenPin = 13;
var yellowPin = 15;

var photoPin = 12;

var CAPACITOR_POLL_DELAY = 10;

var isTiming = {};
var pinTimer = function (pin, cb) {
  if (isTiming[pin+'']) return;
  isTiming[pin+''] = true;
  var counter = 0;
  var readPoller = function (pin, cb) {
    gpio.read(pin, function (err, value) {
      if (err) { isTiming[pin+''] = false; process.stdout.write('X') }
      if (value === 1) { isTiming[pin+''] = false; return cb(counter); }
      if (counter > 80) { isTiming[pin+''] = false; return cb(Infinity); }
      counter++;
      setTimeout(function () {
        return readPoller(pin, cb);
      }, CAPACITOR_POLL_DELAY);
    });
  };

  // discharge
  gpio.setDirection(pin, 'out', function (err) {
    if (err) { isTiming[pin+''] = false; process.stdout.write('X'); }
    gpio.write(pin, 0, function (err) {
      if (err) { isTiming[pin+''] = false; process.stdout.write('X'); }
      setTimeout(function () {
        gpio.setDirection(pin, 'in', function (err) {
          if (err) { isTiming[pin+''] = false; process.stdout.write('X'); }
          readPoller(pin, cb);
        });
      }, 50);
    });
  });
};

var colorTimer = function (pin, cb) {
  gpio.open(pin, 'out', function(err) {
    if (err) { process.stdout.write('X'); }
    gpio.write(pin, 1, function(err) {
      if (err) { process.stdout.write('X'); }
      pinTimer(photoPin, function (count) {
        gpio.close(pin, function () {
          cb(count);
        });
      });
    });
  });
};

var isRGYTiming = false;
var isRGY = function (cb) {
  if (isRGYTiming) return;
  isRGYTiming = true;
  colorTimer(redPin, function (redCount) {
    colorTimer(greenPin, function (greenCount) {
      colorTimer(yellowPin, function (yellowCount) {
        isRGYTiming = false;
        cb({r: redCount, g: greenCount, y: yellowCount});
      });
    });
  });
};

var btw = function (val, a, b) {
  return val >= a && val <= b;
};

var checkColors = function (cb) {
  isRGY(function (val) {
    /* the detector is better and finding shades of yellow and red, 
     it is very bad at finding shades of green or blue,
     but it can tell the difference between blue and red or yellow.
     */
    var output = {
      rgy: val,
      isNone: btw(val.r, 6, 10) && btw(val.g, 6, 10) && btw(val.y, 6, 10),
      isRed: val.r < 15 && val.g === Infinity && val.y < 15,
      isGreen: btw(val.r, 14, 17) && val.g === Infinity && btw(val.y, 13, 15),
      isYellow: btw(val.r, 5, 15) && btw(val.g, 17, 80) && btw(val.y, 5, 15),
      isOrange: btw(val.r, 6, 11) && btw(val.g, 15, 60) && btw(val.y, 5, 10),
      isBlue: btw(val.r, 10, 17) && val.g === Infinity && btw(val.y, 11, 17)
    };
    cb(output);
    checkColors(cb);
  });
};

checkColors(function (val) {
  if (val.isNone) {}
  var colors = [];
  if (val.isRed) { colors.push('red'.red); }
  if (val.isGreen) { colors.push('green'.green); }
  if (val.isYellow) { colors.push('yellow'.yellow); }
  if (val.isOrange) { colors.push('orange'.orange); }
  if (val.isBlue) { colors.push('blue'.blue); }
  var detected = colors.join(', ');
  if (val.isNone) {
    process.stdout.write('.');
  } else if (colors.length) {
    process.stdout.write(' (' + val.rgy.r + ' ' + val.rgy.g  + ' ' + val.rgy.y + ') ');
    process.stdout.write(detected);
  } else {
    process.stdout.write(val.isRed ? 'R' : '.');
    process.stdout.write(val.isGreen ? 'G' : '.');
    process.stdout.write(val.isYellow ? 'Y' : '.');
    process.stdout.write(val.isBlue ? 'B' : '.');
    process.stdout.write(' (' + val.rgy.r + ' ' + val.rgy.g  + ' ' + val.rgy.y + ')');
  }
});

gpio.open(photoPin, 'in', function () {
  console.log('started');
});

// clean up GPIO before exiting
process.stdin.resume();

process.on('SIGINT', function () {
  gpio.close(redPin);
  gpio.close(greenPin);
  gpio.close(yellowPin);
  gpio.close(12);
  process.exit(2);
});
