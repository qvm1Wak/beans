var gpio = require('./pi-gpio');
var colors = require('colors');
var _ = require('underscore');
var fs = require('fs');
fs.existsSync = require('path').existsSync;
var omx = require('omx-manager');
var spawn = require('child_process').spawn;
var path = require('path');
var program = require('commander');

program.version('0.0.1')
  .option('-d, --debug [debug]')
  .option('-c, --calibrate [debug]')
  .parse(process.argv);
omx.enableHangingHandler();


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
      if (counter > 150) { isTiming[pin+''] = false; return cb(Infinity); }
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
//    colorTimer(greenPin, function (greenCount) {
      colorTimer(yellowPin, function (yellowCount) {
        isRGYTiming = false;
        cb({r: redCount, g: 0/*greenCount*/, y: yellowCount});
      });
//    });
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
      isNone: btw(val.r, 6, 10) && btw(val.y, 6, 10),
      //isRed: btw(val.r, 12, 16) && val.g > 100 && btw(val.y, 12, 13),
      //isOrange: btw(val.r, 12, 14) && val.g > 100 && btw(val.y, 12, 13),
      isYellow: btw(val.r, 10, 12) && btw(val.y, 10, 16),
      //isYellow2: btw(val.r, 5, 15) && btw(val.g, 17, 80) && btw(val.y, 5, 15),
      isPurple: btw(val.r, 20, 24) && btw(val.y, 25, 32),
      isGreen: btw(val.r, 12, 15) && btw(val.y, 18, 22)
    };
    if (output.isRed) { output.colors.red = 1; }
    if (output.isOrange) { output.colors.orange = 1; }
    if (output.isYellow) { output.colors.yellow = 1; }
    if (output.isYellow2) { output.colors.yellow2 = 1; }
    if (output.isPurple) { output.colors.purple = 1; }
    if (output.isGreen) { output.colors.green = 1; }

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
  } else if (!isColorStreak && _.filter(_.pluck(streaks, 'isOrange'), function (a) { return !!a; }).length > 2) {
    isColorStreak = true;
    return 'orange';
  } else if (!isColorStreak && _.filter(_.pluck(streaks, 'isYellow'), function (a) { return !!a; }).length > 2) {
    isColorStreak = true;
    return 'yellow';
  } else if (!isColorStreak && _.filter(_.pluck(streaks, 'isYellow2'), function (a) { return !!a; }).length > 2) {
    isColorStreak = true;
    return 'yellow2';
  } else if (!isColorStreak && _.filter(_.pluck(streaks, 'isPurple'), function (a) { return !!a; }).length > 2) {
    isColorStreak = true;
    return 'purple';
  } else if (!isColorStreak && _.filter(_.pluck(streaks, 'isGreen'), function (a) { return !!a; }).length > 2) {
    isColorStreak = true;
    return 'green';
  }
};

var currentSong = null;
var playSong = function (song) {
  if (!song) return;

  var songs = {
    'red'     : 'AsGalinhas.mp3',
    'orange'  : 'BarcoNegro_comp.mp3',
    'yellow'  : 'FadoTropical_comp.mp3',
    'yellow2' : 'Ruca.mp3',
    'purple'  : 'MusicaDasCores_short.mp3',
    'green'   : 'CarlosdoCarmo_comp.mp3',
    'none'    : null
  };
  if ((!song || !songs[song]) && currentSong) {
    omx.stop();
    console.log('pausing');
    currentSong = null;
  } else if (!!songs[song] && !currentSong && !program.calibrate) {
    omx.stop();
    omx.play('./mp3/' + songs[song]);
    if (program.debug) {
      setTimeout(function () {
        omx.stop();
      }, 2000);
    }
    console.log('playing ' + songs[song]);
    currentSong = songs[song];
  }
};

// TODO
// spawn('amixer', ['set', 'PCM', '--', '-0']);

checkColors(function (val) {
  var colors = Object.keys(val.colors);
  var detected = colors.join(', ');
  if (program.debug) {
    if (val.isNone) {
      process.stdout.write('.');
    } else if (colors.length) {
      process.stdout.write(' ' + val.rgyString + ' ');
      process.stdout.write(detected);
    } else {
      process.stdout.write(' ' + val.rgyString + ')');
    }
  }

  if (program.calibrate) {
    console.log(val.rgyString + ' ' + detected);
  }

  // detect streaks
  var s = handleStreaks(val);
  if (program.debug) {
    process.stdout.write(s ? s : '');
  }
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
