/**
 * Loads variables from .env into process.env (once, however many files require this).
 * On Render there is no .env file — the variables come from the dashboard instead.
 */
require('dotenv').config({ quiet: true });

module.exports = process.env;
