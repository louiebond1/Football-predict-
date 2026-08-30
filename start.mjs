import './server.mjs';

const port = Number(process.env.PORT || 3000);

setTimeout(async () => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/football/fixtures`);
    const body = await response.text();
    if (!response.ok) {
      console.error(`KickPot startup fixture sync failed (${response.status}): ${body}`);
      return;
    }
    console.log('KickPot startup fixture sync completed');
  } catch (error) {
    console.error('KickPot startup fixture sync failed:', error.message);
  }
}, 1500);
