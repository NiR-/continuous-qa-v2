#!/usr/bin/env node
(async () => {
  try {
    const { server } = await import('../src/http');
    server.listen(80);
    console.log('Start listening on port 80.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
