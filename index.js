const path = require('path');
const express = require('express');
const app = express();

function resolvePort() {
  return process.env.PORT || 8080;
}

function resolveHostname() {
  return process.env.MEAT_SCOPE_HOSTNAME || '0.0.0.0';
}

function resolveStaticFolder() {
  return path.resolve(process.env.MEAT_SCOPE_STATIC_FOLDER || './client');
}

const staticFolder = resolveStaticFolder();
const port = resolvePort();
const hostname = resolveHostname();

app.use(express.static(staticFolder));
app.get('*', function(req, res, next) {
  res.sendFile(`${staticFolder}/index.html`);
});

app.listen(port);

console.log(`Serving ${staticFolder} app on ${hostname}:${port}.`);
