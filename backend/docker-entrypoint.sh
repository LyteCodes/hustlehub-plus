#!/bin/sh
set -e

node scripts/init.js

exec node src/server.js
