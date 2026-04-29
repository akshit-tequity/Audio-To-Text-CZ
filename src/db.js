const mongoose = require('mongoose');
const { config } = require('./config');
const log = require('./logger');

async function connect() {
  await mongoose.connect(config.mongoUri);
  log.info('db', 'connected to MongoDB');
}

module.exports = { connect, mongoose };
