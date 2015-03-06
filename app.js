var gpio = require("pi-gpio");


var redOn = 1;
var greenOn = 0;
var blueOn = 0;
var photoPin = 12;

var start = function () {
  gpio.open(11, 'out', function(err) {     // Open pin 16 for output 
    gpio.write(11, redOn, function() {          // Set pin 16 high (1) 
      gpio.close(11);                     // Close pin 16 
    });
  });
  gpio.open(13, 'out', function(err) {     // Open pin 16 for output 
    gpio.write(13, greenOn, function() {          // Set pin 16 high (1) 
      gpio.close(13);                     // Close pin 16 
    });
  });
  gpio.open(15, 'out', function(err) {     // Open pin 16 for output 
    gpio.write(15, blueOn, function() {          // Set pin 16 high (1) 
      gpio.close(15);                     // Close pin 16 
    });
  });

  var pinTimer = function (pin, cb) {
    var counter = 0;
    var readPoller = function (pin, cb) {
      gpio.read(pin, function (err, value) {
        if (err) console.log(err);
        if (value === 1) { return cb(counter); }
        counter++;
        return readPoller(pin, cb);
      });
    };

    // discharge
    gpio.setDirection(pin, 'out', function (err) {
      if (err) console.log(err);
      gpio.write(pin, 0, function (err) {
        if (err) console.log(err);
        setTimeout(function () {
          gpio.setDirection(pin, 'in', function (err) {
            if (err) console.log(err);
            readPoller(pin, cb);
          });
        }, 100);
      });
    });
  };

  gpio.open(photoPin, 'in', function () {
    setInterval(function () {
      pinTimer(photoPin, function (count) {
        console.log(count);
      });
    }, 1000);
  });

  console.log('started');
};

gpio.close(11, function () {
  gpio.close(13, function () {
    gpio.close(15, function () {
      gpio.close(12, function () {
        start();
      });
    });
  });
});
