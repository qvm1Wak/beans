var gpio = require('./pi-gpio');
var colors = require('colors');
var _ = require('underscore');
var fs = require('fs');
var omx = require('omx-manager');
var spawn = require('child_process').spawn;
var path = require('path');
var program = require('commander');
var util = require('util');
var winston = require('winston');

var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.File)({
      name: 'info-file',
      filename: 'info.log',
      level: 'info'
    }),
    new (winston.transports.File)({
      name: 'debug-file',
      filename: 'debug.log',
      level: 'debug'
    })
  ]
});
// winston.add(winston.transports.File, { filename: 'debug.log' });
// winston.remove(winston.transports.Console);
// var logger = winston;

omx.enableHangingHandler();

// the program accepts a few command line arguments
// TODO -h for help
program.version('0.0.1')
  .option('-d, --debug [debug]')
  .option('-c, --calibrate [debug]')
  .option('-s, --shortclip [short sound clip]')
  .parse(process.argv);

logger.log('info', 'Application started' + (program.debug ? ' [debug]' : (program.calibrate ? ' [calibrate]' : '')));
logger.log('debug', 'Application started' + (program.debug ? ' [debug]' : (program.calibrate ? ' [calibrate]' : '')));


// Hack: mokeypatch for fs
fs.existsSync = require('path').existsSync;

// pin numbers
var redPin = 11;
var greenPin = 13;
var bluePin = 15;
var photoPin = 12;

var CAPACITOR_POLL_DELAY = 10;

var pinTimer = (function () {
  /*
   
   */
  var isTiming = {};
  return function (pin, cb) {
    if (isTiming[pin+'']) return;
    isTiming[pin+''] = true;
    var counter = 0;
    var readPoller = function (pin, cb) {
      logger.log('debug', '1');
      gpio.read(pin, function (err, value) {
        logger.log('debug', '2');
        if (err) { isTiming[pin+''] = false; logger.log('debug', 'error'); }
        if (value === 1) { isTiming[pin+''] = false; return cb(counter); }
        if (counter > 200) { isTiming[pin+''] = false; return cb(Infinity); }
        counter++;
        logger.log('debug', '3');
        setTimeout(function () {
          logger.log('debug', '4');
          return readPoller(pin, cb);
        }, CAPACITOR_POLL_DELAY);
      });
    };

    // discharge
    gpio.setDirection(pin, 'out', function (err) {
      logger.log('debug', '5');          
      if (err) { isTiming[pin+''] = false;  logger.log('debug', 'error'); }
      logger.log('debug', '6');
      gpio.write(pin, 0, function (err) {
        logger.log('debug', '7');
        if (err) { isTiming[pin+''] = false;  logger.log('debug', 'error'); }
        logger.log('debug', '8');
        setTimeout(function () {
          logger.log('debug', '9');
          gpio.setDirection(pin, 'in', function (err) {
            logger.log('debug', '10');
            if (err) { isTiming[pin+''] = false;  logger.log('debug', 'error'); }
            logger.log('debug', '11');
            readPoller(pin, cb);
          });
        }, 50);
      });
    });
  };
}());

var colorTimer = function (pin, cb) {
  logger.log('debug', '12');
  gpio.open(pin, 'out', function(err) {
    logger.log('debug', '13');
    if (err) { logger.log('debug', 'error'); }
    logger.log('debug', '14');
    gpio.write(pin, 1, function(err) {
      logger.log('debug', '15');
      if (err) { logger.log('debug', 'error'); }
      logger.log('debug', '16');
      pinTimer(photoPin, function (count) {
        logger.log('debug', '17');
        gpio.close(pin, function () {
          logger.log('debug', '18');
          cb(count);
        });
      });
    });
  });
};

var isRGB = (function () {
  /*
   
   */

  // lock variable so no more than one client can call this function
  var isRGBTiming = false;
  return function (cb) {
    logger.log('debug', '19');
    if (isRGBTiming) return;
    isRGBTiming = true;
    colorTimer(redPin, function (redCount) {
      logger.log('debug', '20');
      colorTimer(greenPin, function (greenCount) {
        logger.log('debug', '21');
        colorTimer(bluePin, function (blueCount) {
          logger.log('debug', '22');
          isRGBTiming = false;
          cb({r: redCount, g: greenCount, b: blueCount});
        });
      });
    });
  };
}());

var btw = function (val, a, b) {
  return val >= a && val <= b;
};

/*   
 */
var checkColors = function (cb) {
  isRGB(function (val) {

    var output = {
      rgb: val,
      rgbString: '(' + val.r + ' ' + val.g  + ' ' + val.b + ')',
      colors: {},
      isNone: btw(val.r, 1, 15) && btw(val.g, 1, 18) && btw(val.b, 1, 12),
      isRed: btw(val.r, 11, 17) && btw(val.g, 19, 24) && btw(val.b, 10, 13),
      isOrange: btw(val.r, 17, 21) && btw(val.g, 42, 63) && btw(val.b, 13, 15),
      isYellow: btw(val.r, 16, 20) && btw(val.g, 32, 41) && btw(val.b, 12, 13),
      //isYellow2: btw(val.r, 5, 15) && btw(val.g, 17, 20) && btw(val.b, 5, 14),
      isPurple: btw(val.r, 23, 42) && btw(val.g, 44, 70) && btw(val.b, 11, 16),
      isGreen: btw(val.r, 19, 22) && btw(val.g, 31, 38) && btw(val.b, 12, 15),
      isGreen2: btw(val.r, 29, 31) && btw(val.g, 34, 39) && btw(val.b, 18, 20)
      // isNone: btw(val.r, 6, 10) && btw(val.b, 6, 10),
      // isRed: btw(val.r, 18, 26) && btw(val.g, 24, 39) && btw(val.b, 20, 26),
      // isOrange: btw(val.r, 12, 17) && btw(val.g, 19, 25) && btw(val.b, 15, 18),
      // isYellow: btw(val.r, 10, 16) && btw(val.g, 17, 20) && btw(val.b, 11, 16),
      // //isYellow2: btw(val.r, 5, 15) && btw(val.g, 17, 20) && btw(val.b, 5, 14),
      // isPurple: btw(val.r, 32, 42) && btw(val.g, 35, 49) && btw(val.b, 17, 22),
      // isGreen: btw(val.r, 19, 21) && btw(val.g, 21, 23) && btw(val.b, 12, 15),
      // isGreen2: btw(val.r, 29, 31) && btw(val.g, 34, 39) && btw(val.b, 18, 20)

    };
    if (output.isRed) { output.colors.red = 1; }
    if (output.isOrange) { output.colors.orange = 1; }
    if (output.isYellow) { output.colors.yellow = 1; }
    if (output.isYellow2) { output.colors.yellow2 = 1; }
    if (output.isPurple) { output.colors.purple = 1; }
    if (output.isGreen) { output.colors.green = 1; }
    if (output.isGreen2) { output.colors.green2 = 1; }

    cb(output);
    checkColors(cb);
  });
};

var handleStreaks = (function () {
  var streaks = [{}, {}, {}];
  var isColorStreak = false;
  return function (val) {
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
    } else if (!isColorStreak && _.filter(_.pluck(streaks, 'isGreen'), function (a) { return !!a; }).length > 2) {
      isColorStreak = true;
      return 'green2';
    }
  };
}());

var playSong = (function () {
  var currentSong = null;
  return function (song) {
    if (!song) return;

    var songs = {
      'red'     : 'AsGalinhas.mp3',
      'orange'  : 'BarcoNegro_comp.mp3',
      'yellow'  : 'FadoTropical_comp.mp3',
      'yellow2' : 'Ruca.mp3',
      'purple'  : 'MusicaDasCores_short.mp3',
      'green'   : 'CarlosdoCarmo_comp.mp3',
      'green2'   : 'CarlosdoCarmo_comp.mp3',
      'none'    : null
    };
    if ((!song || !songs[song]) && currentSong) {
      omx.stop();
      logger.log('info', 'pausing');
      currentSong = null;
    } else if (!!songs[song] && !currentSong && !program.calibrate) {
      omx.stop();
      omx.play('./mp3/' + songs[song]);
      if (program.shortclip) {
        setTimeout(function () {
          omx.stop();
        }, 2000);
      }
      logger.log('info', 'playing');
      currentSong = songs[song];
    }
  };
}());

// TODO
// spawn('amixer', ['set', 'PCM', '--', '-0']);

checkColors(function (val) {
  var colors = Object.keys(val.colors);
  var detected = colors.join(', ');
  if (program.debug) {
    if (val.isNone) {
      logger.log('info', '.');
    } else if (colors.length) {
      logger.log('info', ' ' + val.rgbString + ')'); // process.stdout.write
      logger.log('info', detected);
    } else {
      logger.log('info', ' ' + val.rgbString + ')');
    }
  }

  if (program.calibrate) {
    logger.log('info', val.rgbString + ' ' + detected);
    console.log(val.rgbString + ' ' + detected);
  }

  // detect streaks
  var s = handleStreaks(val);
  if (program.debug) {
    logger.log('info', s ? s : '');
  }
  playSong(s);
});

gpio.open(photoPin, 'in');

// clean up GPIO before exiting
process.stdin.resume();

process.on('SIGINT', function () {
  gpio.close(redPin);
  gpio.close(greenPin);
  gpio.close(bluePin);
  gpio.close(photoPin);
  logger.log('info', 'Exiting normally');
  logger.log('debug', 'Exiting normally');
  process.exit(2);
});
