const { Client } = require('ssh2');

const config = {
  host: '66.23.233.13',
  port: 22,
  username: 'root',
  password: 'wgMVh6@eb256@LJ',
  readyTimeout: 20000
};

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected. Starting deployment on remote server...\n');
  
  // We check if .git directory exists. If not, we initialize git, set origin, and reset to origin/main.
  // Otherwise, we just pull.
  // We also back up and restore .env because it is now untracked in GitHub.
  const setupGitCmd = `
    cd /var/www/vspaypsp
    if [ ! -d ".git" ]; then
      echo "=== Git repo missing. Initializing git... ==="
      git init
      git remote add origin https://github.com/Cad-0314/vspaypsp.git
    else
      echo "=== Git repo already initialized ==="
    fi
  `.trim();

  const cmds = [
    { label: 'Check/Setup Git repo', cmd: setupGitCmd },
    { label: 'Back up .env file', cmd: 'if [ -f "/var/www/vspaypsp/.env" ]; then cp /var/www/vspaypsp/.env /var/www/vspaypsp_env_backup && echo "Backed up .env"; else echo "No .env found to back up"; fi' },
    { label: 'Fetch latest references', cmd: 'cd /var/www/vspaypsp && git fetch origin' },
    { label: 'Reset to origin/main', cmd: 'cd /var/www/vspaypsp && git reset --hard origin/main' },
    { label: 'Restore .env file', cmd: 'if [ -f "/var/www/vspaypsp_env_backup" ]; then cp /var/www/vspaypsp_env_backup /var/www/vspaypsp/.env && rm -f /var/www/vspaypsp_env_backup && echo "Restored .env"; else echo "No backup to restore"; fi' },
    { label: 'Verify current commit', cmd: 'cd /var/www/vspaypsp && git log -n 1' },
    { label: 'Verify .env dialect', cmd: 'grep -E "^DB_DIALECT" /var/www/vspaypsp/.env || echo "No DB_DIALECT in .env"' },
    { label: 'Install dependencies', cmd: 'cd /var/www/vspaypsp && npm install --production' },
    { label: 'Reload PM2 service', cmd: 'cd /var/www/vspaypsp && pm2 reload gaurpay-api --update-env' },
    { label: 'Check PM2 status', cmd: 'pm2 status' },
    { label: 'Check Health endpoint', cmd: 'curl -s http://localhost:3000/health' }
  ];

  let idx = 0;
  function next() {
    if (idx >= cmds.length) {
      console.log('\nDeployment script execution completed successfully!');
      conn.end();
      process.exit(0);
      return;
    }
    const { label, cmd } = cmds[idx];
    console.log(`>>> [${idx + 1}/${cmds.length}] ${label}`);
    let output = '';
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error(`Error running: ${label}`, err);
        conn.end();
        process.exit(1);
        return;
      }
      stream.on('data', d => { output += d.toString(); });
      stream.stderr.on('data', d => { output += d.toString(); });
      stream.on('close', (code) => {
        console.log(output.trim() || `(no output, exit code: ${code})`);
        console.log('--------------------------------------------------');
        idx++;
        next();
      });
    });
  }
  next();
}).on('error', err => {
  console.error('SSH Connection Error:', err);
  process.exit(1);
}).connect(config);
