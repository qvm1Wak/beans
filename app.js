var gpio = require('./pi-gpio');
var colors = require('colors');
var _ = require('underscore');
var fs = require('fs');
fs.existsSync = require('path').existsSync;
var omx = require('omx-manager');
var spawn = require('child_process').spawn;

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
      rgyString: '(' + val.r + ' ' + val.g  + ' ' + val.y + ')',
      colors: {},
      isNone: btw(val.r, 6, 10) && btw(val.g, 6, 10) && btw(val.y, 6, 10),
      isRed: val.r < 15 && val.g > 70 && val.y < 15,
      isGreen: btw(val.r, 14, 17) && val.g === Infinity && btw(val.y, 13, 15),
      isYellow: btw(val.r, 5, 15) && btw(val.g, 17, 80) && btw(val.y, 5, 15),
      isOrange: btw(val.r, 6, 11) && btw(val.g, 15, 60) && btw(val.y, 5, 10),
      isBlue: btw(val.r, 10, 17) && val.g === Infinity && btw(val.y, 11, 17)
    };
    if (output.isRed) { output.colors.red = 1; }
    if (output.isGreen) { output.colors.green = 1; }
    if (output.isYellow) { output.colors.yellow = 1; }
    if (output.isOrange) { output.colors.orange = 1; }
    if (output.isBlue) { output.colors.blue = 1; }

    cb(output);
    checkColors(cb);
  });
};

var streaks = [{}, {}, {}];
var isColorStreak = false;
var handleStreaks = function (val) {
  if (!val) return;
  var colors = Object.keys(val.colors);
  
  // continuous queue
  streaks.push(val);
  streaks.shift();

  if (isColorStreak && streaks[0].isNone && streaks[1].isNone && streaks[2].isNone) {
    isColorStreak = false;
    return 'none';
  } else if (!isColorStreak && _.filter(_.pluck(streaks, 'isRed'), function (a) { return !!a; }).length > 2) {
    isColorStreak = true;
    return 'red';
  } else if (!isColorStreak && _.filter(_.pluck(streaks, 'isGreen'), function (a) { return !!a; }).length > 2) {
    isColorStreak = true;
    return 'green';
  } else if (!isColorStreak && _.filter(_.pluck(streaks, 'isYellow'), function (a) { return !!a; }).length > 2) {
    isColorStreak = true;
    return 'yellow';
  } else if (!isColorStreak && _.filter(_.pluck(streaks, 'isOrange'), function (a) { return !!a; }).length > 2) {
    isColorStreak = true;
    return 'orange';
  } else if (!isColorStreak && _.filter(_.pluck(streaks, 'isBlue'), function (a) { return !!a; }).length > 2) {
    isColorStreak = true;
    return 'blue';
  }
};

var playSong = function () {

};
omx.enableHangingHandler();
//spawn('amixer', ['set', 'PCM', '--', '-0']);
//omx.play('./mp3/BarcoNegro_comp.mp3', {'--vol': 0});

checkColors(function (val) {
  var colors = Object.keys(val.colors);
  var detected = colors.join(', ');
  // if (val.isNone) {
  //   process.stdout.write('.');
  // } else if (colors.length) {
  //   process.stdout.write(' ' + val.rgyString + ' ');
  //   process.stdout.write(detected);
  // } else {
  //   process.stdout.write(' ' + val.rgyString + ')');
  // }
  
  // detect streaks
  var s = handleStreaks(val);
  process.stdout.write(s ? s : '');

  playSong(s);
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
