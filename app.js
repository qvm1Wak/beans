var gpio = require('./pi-gpio');


var redOn = 0;
var greenOn = 0;
var blueOn = 0;
var redPin = 11;
var greenPin = 13;
var yellowPin = 15;

var photoPin = 12;

var CAPACITOR_POLL_DELAY = 10;

var start = function () {
  gpio.open(greenPin, 'out', function(err) {
    gpio.write(greenPin, greenOn, function() {
      // gpio.close(greenPin);
    });
  });
  gpio.open(yellowPin, 'out', function(err) {
    gpio.write(yellowPin, blueOn, function() {
      // gpio.close(yellowPin);
    });
  });

  var isTiming = {};
  var pinTimer = function (pin, cb) {
    //process.stdout.write('p');
    if (isTiming[pin+'']) return;
    //process.stdout.write('1');
    isTiming[pin] = true;
    var counter = 0;
    var readPoller = function (pin, cb) {
      //process.stdout.write('4');
      gpio.read(pin, function (err, value) {
        //process.stdout.write('5');
        if (err) { isTiming[pin] = false; console.log(err); }
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
      //process.stdout.write('2');
      if (err) { isTiming[pin+''] = false; console.log(err); }
      gpio.write(pin, 0, function (err) {
        //process.stdout.write('3');
        if (err) { isTiming[pin+''] = false; console.log(err); }
        setTimeout(function () {
          gpio.setDirection(pin, 'in', function (err) {
            //process.stdout.write('3');
            if (err) { isTiming[pin+''] = false; console.log(err); }
            readPoller(pin, cb);
          });
        }, 50);
      });
    });
  };

  var isColorTiming = {};
  var colorTimer = function (pin, cb) {
    if (isColorTiming[pin + '']) return;
    isColorTiming[pin + ''] = true;
    gpio.open(pin, 'out', function(err) {
      if (err) { isColorTiming = false; console.log(err); }
      gpio.write(pin, 1, function(err) {
        if (err) { isColorTiming = false; console.log(err); }
        pinTimer(photoPin, function (count) {
          gpio.close(pin, function () {
            cb(count);
            isColorTiming[pin + ''] = false;
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
          cb({r: redCount, g: greenCount, y: yellowCount});
          isRGYTiming = false;
        });
      });
    });
  };

  gpio.open(photoPin, 'in', function () {
    setInterval(function () {
     isRGY(function (val) {
       var isRed = val.r < Infinity && val.g === Infinity && val.y < Infinity && val.y > 5;
       var isGreen = false;
       var isYellow = val.r < Infinity && val.g === Infinity && val.y < Infinity && val.y < 5;
       var isBlue = val.r === Infinity && val.g === Infinity && val.y < Infinity;
       process.stdout.write(isRed ? 'R' : '.');
       process.stdout.write(isGreen ? 'G' : '.');
       process.stdout.write(isYellow ? 'Y' : '.');
       process.stdout.write(isBlue ? 'B' : '.');
       console.log(val.r, val.g, val.y);
     });
    },500);
  });

  console.log('started');
};

gpio.close(redPin, function () {
  gpio.close(greenPin, function () {
    gpio.close(yellowPin, function () {
      gpio.close(12, function () {
        start();
      });
    });
  });
});
