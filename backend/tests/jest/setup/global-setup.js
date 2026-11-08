'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async function globalSetup() {
  const mongod = await MongoMemoryServer.create();
  global.__MONGOD__ = mongod;
  process.env.MONGO_MEM_URI = mongod.getUri();
  process.env.MONGO_USE_RUNTIME_ADAPTERS = '1';
};
