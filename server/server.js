require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
const createApp = require('./app');
const { ensureSeeded } = require('./seed/seed');
const { assertJwtSecret } = require('./middleware/auth');

const PORT = process.env.PORT || 5000;
const SHUTDOWN_TIMEOUT_MS = 10000;

(async () => {
  try {
    assertJwtSecret(); // production refuses to start with a missing or default secret
    await connectDB();
    await ensureSeeded(); // seeds the legal database + admin account on first run
  } catch (err) {
    console.error('✖ Could not start server:', err.message);
    if (err.hint) console.error(`  ${err.hint}`);
    process.exit(1);
  }

  const server = createApp().listen(PORT, () => console.log(`✔ Bail Reckoner running at http://localhost:${PORT}`));

  // Graceful shutdown: Render sends SIGTERM before replacing the server on a new deploy, and
  // Ctrl+C sends SIGINT. Finish the requests in progress, close MongoDB, then exit.
  const shutdown = (signal) => {
    console.log(`\n${signal} received — shutting down…`);
    setTimeout(() => {
      console.error('✖ Requests did not finish in time; forcing exit.');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    server.close(async () => {
      await disconnectDB();
      console.log('✔ Server and database connection closed.');
      process.exit(0);
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
})();
