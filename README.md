# About

Radio Raspberry is a radio that chooses tracks by placing fruit on the player. The player is powered by Raspberry Pi and works by detecting the color of the fruit. The application is written in Node.js.

# Installation

As prerequisites, install nodejs and npm, as well as quick2wire-gpio-admin. We used a patched version of quick2wire-gpio-admin that works with Raspberry Pi 2.

See the /circuit folder for pictures of the circuit.

From your Raspberry Pi
```
git clone git@github.com:qvm1Wak/radio-raspberry.git
cd radio-raspberry
npm install
node app.js
```

At this point, lights should flash red, green, and blue in rapid succession and values should display on the terminal.

'''-c''' - calibration mode -- Calibrate the device for given lighting conditions by placing objects and reading the RGB values detected. Those values can then be entered into the ```app.js``` script. The calibration output shows three columns: RGB values detected, rgb 10% and 90% quantiles detected in the last 10 readings, and size of each of the ranges. This mode does not play songs or detect streaks of colors.  
'''-d''' - debug mode -- Shows RGB information in the console during normal operation. The uncovered state shows as '.'.  
'''-c''' - calibration mode  


This was tested on the latest Raspbian on Raspberry Pi 2. Raspberry Pi 2 did not work out of the box with node.js's pi-gpio library, so a patched one was required (the pi-gpio.js file). The project also used a patched version of quick2wire-gpio-admin (not included, compiled from source).

# Credits

Radio Raspberry is a project by Madeira Interactive Technologies Institute and Carnegie Mellon Univeristy.
