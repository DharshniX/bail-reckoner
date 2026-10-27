/**
 * MongoDB connection — a local MongoDB server in development, MongoDB Atlas in production.
 * The connection string comes from MONGODB_URI. Its username/password are never logged.
 */
const mongoose = require('mongoose');

const LOCAL_URI = 'mongodb://127.0.0.1:27017/bail_reckoner';

let closing = false;        // true while we disconnect on purpose (so it isn't reported as a problem)
let listenersAdded = false;

/** Picks the connection string: MONGODB_URI, or the local server outside production. */
function resolveUri(uri = process.env.MONGODB_URI) {
  const value = (uri || '').trim();
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI is not set. Add your MongoDB Atlas connection string to the environment variables.');
    }
    return LOCAL_URI;
  }
  if (!/^mongodb(\+srv)?:\/\//.test(value)) {
    throw new Error('MONGODB_URI must start with "mongodb://" or "mongodb+srv://".');
  }
  return value;
}

/** Hides the username and password so a connection string can be printed safely. */
function maskUri(text) {
  return String(text).replace(/(mongodb(?:\+srv)?:\/\/)[^\s]*@/g, '$1***:***@');
}

/** Turns the driver's error into a hint the developer can act on. */
function hintFor(err) {
  const text = `${err.name} ${err.message} ${err.cause?.message || ''}`;
  if (/bad auth|authentication failed/i.test(text)) {
    return 'Wrong database username or password. Check Atlas → Database Access, and URL-encode special characters in the password (for example @ → %40).';
  }
  if (/querySrv|ENOTFOUND|EREFUSED|getaddrinfo/i.test(text)) {
    return 'The cluster address could not be found. Copy the connection string again from Atlas → Connect → Drivers, and check your internet connection.';
  }
  if (/ECONNREFUSED/.test(text)) {
    return 'Nothing is listening at that address. Start your local MongoDB server, or set MONGODB_URI to your Atlas cluster.';
  }
  if (/whitelist|IP that isn't|timed out|ETIMEDOUT|ServerSelection/i.test(text)) {
    return 'The database did not answer in time. In Atlas → Network Access, allow this machine\'s IP address (Render needs 0.0.0.0/0).';
  }
  if (/MongoParseError|Invalid scheme|URI/i.test(text)) {
    return 'MONGODB_URI is not a valid connection string.';
  }
  return 'Check that MONGODB_URI is correct and the database server is reachable.';
}

/**
 * Creates/drops indexes so the database matches the schemas in models/index.js
 * (unique email, offence section, provision code, rule key; assessments by user + date).
 */
async function syncAllIndexes() {
  require('../models'); // make sure every model is registered
  for (const model of Object.values(mongoose.models)) {
    const { toCreate, toDrop } = await model.diffIndexes();
    if (!toCreate.length && !toDrop.length) continue;
    await model.syncIndexes();
    const changes = [...toCreate.map((key) => `+${JSON.stringify(key)}`), ...toDrop.map((name) => `-${name}`)];
    console.log(`✔ Indexes updated on ${model.collection.name}: ${changes.join(' ')}`);
  }
}

/** Connects, reports the host (never the credentials) and syncs indexes. */
async function connectDB(uri) {
  const url = resolveUri(uri);
  mongoose.set('strictQuery', true);
  try {
    // autoIndex is off because syncAllIndexes() below manages indexes in one place
    await mongoose.connect(url, { serverSelectionTimeoutMS: 10000, autoIndex: false });
  } catch (err) {
    const error = new Error(`Could not connect to MongoDB at ${maskUri(url).replace(/\?.*$/, '')}: ${maskUri(err.message)}`);
    error.hint = hintFor(err);
    throw error;
  }
  closing = false;
  const { host, name } = mongoose.connection;
  console.log(`✔ MongoDB connected: ${host}/${name}`);

  if (!listenersAdded) {
    listenersAdded = true;
    mongoose.connection.on('disconnected', () => { if (!closing) console.warn('⚠ MongoDB connection lost — retrying…'); });
    mongoose.connection.on('reconnected', () => console.log('✔ MongoDB reconnected'));
    mongoose.connection.on('error', (err) => console.error('✖ MongoDB error:', maskUri(err.message)));
  }

  await syncAllIndexes();
  return mongoose.connection;
}

/** Closes the connection on purpose (graceful shutdown, end of a script or test). */
async function disconnectDB() {
  closing = true;
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB, maskUri };
