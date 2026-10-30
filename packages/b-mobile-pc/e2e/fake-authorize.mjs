// A stand-in for the sign-in page's authorize endpoint: immediately redirects to the redirect URI it
// was given, with a token in the fragment, as the implicit grant does. The shell's BMPC_AUTH_ORIGIN
// test hook points the sign-in window here. Usage: node fake-authorize.mjs [port]
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 5193);
createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  const redirect = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state');
  console.log(
    `authorize ${url.pathname} client_id=${url.searchParams.get('client_id')} scope=${url.searchParams.get('scope')} redirect=${redirect}`,
  );
  if (!redirect || !state) {
    res.writeHead(400);
    res.end('bad request');
    return;
  }
  res.writeHead(302, {
    location: `${redirect}#access_token=e2e-token&state=${state}&token_type=bearer&username=cyclopstest`,
  });
  res.end();
}).listen(port, '127.0.0.1');
