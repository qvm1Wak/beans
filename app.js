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
var summary = require('summary');

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

var DECAY_RATE = 20;

var pinTimer = (function () {
  var isTiming = {};
  return function (pin, cb) {
    // console.log('timing', pin);
    if (isTiming[pin+'']) return;
    isTiming[pin+''] = true;
    var counter = 0;
    var readPoller = function (pin, cb) {
      if (!isTiming[pin+'']) { cb(-1); return; } // in case of errors elsewhere
      gpio.read(pin, function (err, value) {
        if (err) { isTiming[pin+''] = false; logger.log('debug', 'error 1'); cb(-1); return; }
        if (value === 1) { isTiming[pin+''] = false; cb(counter); return; }
        if (counter > 150) { isTiming[pin+''] = false; cb(Infinity); return; }
        // console.log('timing 5', pin, counter);

        counter++;
        //if (counter%2===0) {
          setTimeout(function () {
            readPoller(pin, cb);
          }, 10);
        //} else {
        //  readPoller(pin, cb);
        //}
      });
    };

    // discharge
    // console.log('timing', pin);
    gpio.setDirection(pin, 'out', function (err) {
      if (err) { isTiming[pin+''] = false; logger.log('debug', 'error 2'); cb(-1); return; }
      // console.log('timing 2', pin);
      gpio.write(pin, 0, function (err) {
        if (err) { isTiming[pin+''] = false; logger.log('debug', 'error 3'); cb(-1); return; }
        // console.log('timing 3', pin);
        gpio.setDirection(pin, 'in', function (err) {
          if (err) { isTiming[pin+''] = false; logger.log('debug', 'error 4'); cb(-1); return; }
          // console.log('timing 4', pin);
          readPoller(pin, cb);
        });
      });
    });
  };
}());

var colorTimer = function (pin, cb) {
  gpio.open(pin, 'out', function(err) {
    if (err) { logger.log('debug', 'error 5'); /* console.log('close 5', pin, err);*/ gpio.close(pin, function (errClose) { /* console.log('closed 5', pin, errClose); */ cb(-1); }); return; }
    gpio.write(pin, 1, function(err) {
      if (err) { logger.log('debug', 'error 6'); /*console.log('close 6', pin, err);*/ gpio.close(pin, function (errClose) { /* console.log('closed 6', pin, errClose); */ cb(-1); }); return; }
      pinTimer(photoPin, function (count) {
        // console.log('close', pin);
        gpio.close(pin, function () {
          // console.log('closed', pin); 
          cb(count);
        });
      });
    });
  });
};

var isRGB = (function () {
  // lock variable so no more than one client can call this function
  var isRGBTiming = false;
  return function (cb) {
    if (isRGBTiming) return;
    isRGBTiming = true;
    colorTimer(redPin, function (redCount) {
      colorTimer(greenPin, function (greenCount) {
        colorTimer(bluePin, function (blueCount) {
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

var checkColors = function (cb) {
  isRGB(function (val) {
    var nextIteration = 0;
    if (val.r === -1 || val.g === -1 || val.b === -1) {
      nextIteration = 500;
    }
    if (val.r < 15 && val.g < 15 && val.b < 15) {
      nextIteration = 500;
    }
    
    var output = {
      rgb: val,
      rgbString: '(' + val.r + ' ' + val.g  + ' ' + val.b + ')',
      colors: {},
      isNone: btw(val.r, 1, 15) && btw(val.g, 1, 18) && btw(val.b, 1, 12),
      isRed: btw(val.r, 15, Infinity) && btw(val.g, 15, Infinity) && btw(val.b, 10, 12),
      isOrange: btw(val.r, 27, 30) && btw(val.g, 38, 40) && btw(val.b, 8, 12),
      //isYellow: btw(val.r, 16, 20) && btw(val.g, 32, 41) && btw(val.b, 12, 13),
      //isYellow2: btw(val.r, 5, 15) && btw(val.g, 17, 20) && btw(val.b, 5, 14),
      isPurple: btw(val.r, 28, 34) && btw(val.g, 46, 50) && btw(val.b, 10, 11),
      isGreen: btw(val.r, 26, 28) && btw(val.g, 32, 37) && btw(val.b, 8, 12)
    };
    if (output.isRed) { output.colors.red = 1; }
    if (output.isOrange) { output.colors.orange = 1; }
    if (output.isYellow) { output.colors.yellow = 1; }
    if (output.isYellow2) { output.colors.yellow2 = 1; }
    if (output.isPurple) { output.colors.purple = 1; }
    if (output.isGreen) { output.colors.green = 1; }
    if (output.isGreen2) { output.colors.green2 = 1; }

    if (val.r !== -1 && val.g !== -1 && val.b !== -1 ) {
      cb(output);
    }
    setTimeout(function () {
      checkColors(cb);
    }, nextIteration);
  });
};

var handleStreaks = (function () {
  var queue = [];
  var streaks = {none: 0, red: 0, orange: 0, yellow: 0, yellow2: 0, purple: 0, green: 0, green2: 0};
  var numItems = 0;
  return function (val) {
    if (!val) return null;
    var colors = Object.keys(val.colors);

    if (numItems < 6) { numItems++;};
    queue.push(val);
    if(val.isNone) { streaks['none']++; }
    if(val.isRed) { streaks['red']++; }
    if(val.isOrange) { streaks['orange']++; }
    if(val.isYellow) { streaks['yellow']++; }
    if(val.isYellow2) { streaks['yellow2']++; }
    if(val.isPurple) { streaks['purple']++; }
    if(val.isGreen) { streaks['green']++; }
    if(val.isGreen2) { streaks['green2']++; }
    var doneVal;
    if (numItems === 6) {
      doneVal = queue.shift();
      if(doneVal.isNone) { streaks['none']--; }
      if(doneVal.isRed) { streaks['red']--; }
      if(doneVal.isOrange) { streaks['orange']--; }
      if(doneVal.isYellow) { streaks['yellow']--; }
      if(doneVal.isYellow2) { streaks['yellow2']--; }
      if(doneVal.isPurple) { streaks['purple']--; }
      if(doneVal.isGreen) { streaks['green']--; }
      if(doneVal.isGreen2) { streaks['green2']--; }
    }

    var selected = _.reduce(_.keys(streaks), function (selected, item) {
      return streaks[item] > 2 ? item : selected;
    }, 'none');
    return selected;
  };
}());

var songs = {
 'orange'  : '1_DAMA_AsVezes.mp3',
 'red'     : '1_XutosEPontapes_NaoSouUnico.mp3',
 'yellow'  : '1_Pharrell_Happy.mp3',
 'yellow2' : '1_Badoxa_Controla.mp3',
 'purple'  : '1_Avicii_AddictedToYou.mp3',
 'green'   : '1_ArcticMonkeys_DoIWannaKnow.mp3',
 'green2'  : '1_AnaMoura_Desfado.mp3',
 'none'    : null
};

var playSong = (function () {
  var currentSong = null;
  return function (song) {
    if ((!song || !songs[song]) && currentSong) {
      omx.stop();
      logger.log('info', 'pausing');
      currentSong = null;
    } else if (!!songs[song] && !program.calibrate) {
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
var summaryWindowSize = 10;
checkColors(function (val) {
  var colors = Object.keys(val.colors);
  var detected = colors.join(', ');

  var rs = [];
  var rSummary;
  var rLow;
  var rHigh;
  var gs = [];
  var gSummary;
  var gLow;
  var gHigh;
  var bs = [];
  var bSummary;
  var bLow;
  var bHigh;

  rs.unshift(val.rgb.r);
  rs = rs.slice(0, summaryWindowSize);
  rSummary = summary(rs.concat());
  rLow = Math.round(rSummary.quartile(0.1));
  rHigh = Math.round(rSummary.quartile(0.9));
  gs.unshift(val.rgb.g);
  gs = gs.slice(0, summaryWindowSize);
  gSummary = summary(gs.concat());
  gLow = Math.round(gSummary.quartile(0.1));
  gHigh = Math.round(gSummary.quartile(0.9));
  bs.unshift(val.rgb.b);
  bs = bs.slice(0, summaryWindowSize);
  bSummary = summary(bs.concat());
  bLow = Math.round(bSummary.quartile(0.1));
  bHigh = Math.round(bSummary.quartile(0.9));

  var ranges = '(' + rLow + '-' + rHigh + ' ' + gLow + '-' + gHigh + ' ' + bLow + '-' + bHigh + ')';
  var rangeSizes = '(' + (rHigh - rLow) + ', ' + (gHigh - gLow) + ', ' + (bHigh - bLow) + ')'; 

  if (program.debug) {
    if (val.isNone) {
      logger.log('info', '.');
    } else if (colors.length) {
      logger.log('info', ' ' + val.rgbString + ') ' + ranges + ' ' + detected); // process.stdout.write
    } else {
      logger.log('info', ' ' + val.rgbString + ')' + ranges + ' ');
    }
  }

  if (program.calibrate) {
    logger.log('info', val.rgbString + ' ' + ranges + ' ' + rangeSizes + ' ' + detected);
    console.log(val.rgbString + ' ' + ranges + ' ' + rangeSizes + ' ' + detected);
  }

  // detect streaks
  var s = handleStreaks(val);
  // if (program.debug) {
  //   logger.log('info', 'streak' + s);
  // }
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
