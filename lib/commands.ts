// Ready-to-run command suggestions for a discovered service, so an operator
// can pivot straight from a finding into the relevant tool (sqlmap, curl, nmap,
// a db client, …). These are copy-to-clipboard helpers for authorized testing
// of your own infrastructure — nothing is executed by the app.

export type Command = { label: string; cmd: string };

const HTTPS_PORTS = new Set([443, 1443, 4443, 5443, 6443, 7443, 8443, 9443, 10443, 12443, 8834, 9091]);

/** Whether a finding should be treated as HTTP for command suggestions. */
export function looksHttp(port: number, service?: string | null): boolean {
  const s = (service ?? '').toLowerCase();
  if (s.includes('http')) return true;
  // Common web ports even when the banner was inconclusive.
  return [80, 81, 88, 443, 591, 2082, 2095, 3000, 5000, 8000, 8008, 8080, 8081,
    8088, 8443, 8888, 9000, 9090, 9443].includes(port);
}

function httpScheme(port: number, service?: string | null): 'http' | 'https' {
  const s = (service ?? '').toLowerCase();
  if (s.includes('https') || HTTPS_PORTS.has(port)) return 'https';
  return 'http';
}

/**
 * Build a prioritised list of copyable commands for a finding. HTTP services
 * lead with web tooling (sqlmap, curl, whatweb, nikto); known service ports get
 * their native client; everything falls back to an nmap version probe + ncat.
 */
export function suggestCommands(ip: string, port: number, service?: string | null): Command[] {
  const out: Command[] = [];
  const target = `${ip}:${port}`;

  if (looksHttp(port, service)) {
    const url = `${httpScheme(port, service)}://${target}/`;
    const k = url.startsWith('https') ? '-k ' : '';
    out.push(
      { label: 'sqlmap', cmd: `sqlmap -u "${url}" --batch --crawl=2 --random-agent` },
      { label: 'curl headers', cmd: `curl -sSI ${k}"${url}"` },
      { label: 'whatweb', cmd: `whatweb -a 3 "${url}"` },
      { label: 'nikto', cmd: `nikto -h "${url}"` },
      { label: 'nmap http', cmd: `nmap -Pn -sV -p ${port} --script http-enum,http-headers ${ip}` },
    );
    if (url.startsWith('https')) {
      out.push({ label: 'tls cert', cmd: `openssl s_client -connect ${target} -servername ${ip} </dev/null 2>/dev/null | openssl x509 -noout -text` });
    }
    return out;
  }

  // Native clients for well-known service ports.
  const native: Record<number, Command> = {
    22: { label: 'ssh', cmd: `ssh -p ${port} user@${ip}` },
    21: { label: 'ftp', cmd: `ftp ftp://${ip}:${port}` },
    25: { label: 'smtp', cmd: `nc -v ${ip} ${port}` },
    3306: { label: 'mysql', cmd: `mysql -h ${ip} -P ${port} -u root -p` },
    5432: { label: 'psql', cmd: `psql "postgresql://postgres@${ip}:${port}/postgres"` },
    6379: { label: 'redis', cmd: `redis-cli -h ${ip} -p ${port}` },
    27017: { label: 'mongo', cmd: `mongosh "mongodb://${ip}:${port}"` },
    3389: { label: 'rdp', cmd: `xfreerdp /v:${ip}:${port} /u:user` },
    5900: { label: 'vnc', cmd: `vncviewer ${ip}:${port}` },
    389: { label: 'ldap', cmd: `ldapsearch -x -H ldap://${ip}:${port} -s base` },
    445: { label: 'smb', cmd: `smbclient -L //${ip} -p ${port} -N` },
  };
  if (native[port]) out.push(native[port]);

  out.push(
    { label: 'nmap version', cmd: `nmap -Pn -sV -p ${port} ${ip}` },
    { label: 'banner', cmd: `nc -v -w 5 ${ip} ${port}` },
  );
  return out;
}
