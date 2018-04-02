(async () => {
  try {
    const { cleanup, STATE_STOPPED } = await import('../src/drivers');

    console.log('Start cleanup...');
    cleanup(process.argv[2] || STATE_STOPPED);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
