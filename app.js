
'use strict';
var argv = require('minimist')(process.argv.slice(2));
var host = '0.0.0.0', port = argv.p;
var path = require('path');
const express = require('express');
var app = express();
app.use(express.static('dist'))
app.get('/*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
app.listen(port, () => console.log(`Listening on http://${host}:${port}/`));