import { loadConfig } from './config.js';
import { initFirebaseAdmin } from './firebaseAdmin.js';
import { createAdminApp } from './app.js';

const config = loadConfig();
const firebaseServices = initFirebaseAdmin(config);
const app = createAdminApp({ config, firebaseServices });

app.listen(config.port, config.host, () => {
  console.log(
    `ABK Trusted Admin Backend listening on http://${config.host}:${config.port} (DB: ${config.databaseId})`
  );
});
