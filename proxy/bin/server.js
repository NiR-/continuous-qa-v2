#!/usr/bin/env node
(async () => {
  try {
    const { server } = await import('../src/http');

    if (process.env.CLEANUP_AT_STARTUP) {
      const { cleanup, STATE_STOPPED } = await import('../src/executors');

      console.log('Start cleanup...');
      await cleanup(process.env.CLEANUP_AT_STARTUP);
    }

    server.listen(80);
    console.log('Start listening on port 80.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
