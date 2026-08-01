'use strict';

/** Emits the packaging icons from the runtime generator so no binary asset lives in the repo. */
const fs = require('fs');
const path = require('path');
const { appIcon } = require('../src/services/icon');

const OUT = path.join(__dirname, '..', 'assets');
fs.mkdirSync(OUT, { recursive: true });

[[512, 'icon.png'], [256, 'icon-256.png'], [64, 'icon-64.png']].forEach(([size, name]) => {
  fs.writeFileSync(path.join(OUT, name), appIcon(size));
  console.log(`assets/${name} (${size}px)`);
});
