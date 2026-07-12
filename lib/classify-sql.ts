import { sql, type SQL } from 'drizzle-orm';

// SQL mirror of lib/classify.ts, for dataset-wide filtering/counting by device
// type (the JS classifier only runs over rows already fetched). Aggregates per
// IP with bool_or over each row's port + text signals, in the SAME specificity
// order as the JS classifier — CASE returns the first match, which lines up with
// the JS scoring because the more-specific categories carry the heavier signals.
//
// Use as a grouped expression: SELECT ip, <deviceTypeCaseSql> ... GROUP BY ip,
// or in HAVING to filter. `\y` is Postgres' word boundary (POSIX ARE).
//
// NOTE: this is a template literal, so every backslash meant for the Postgres
// regex must be doubled (`\\y` → `\y`), otherwise `\y`/`\.` collapse to `y`/`.`
// and the word boundaries silently vanish. Keep in sync with lib/classify.ts.
const TXT = sql`concat_ws(' ', service, product, banner, headers)`;

export function deviceTypeCaseSql(): SQL {
  return sql`CASE
    WHEN bool_or(port = ANY(ARRAY[623,16992,16993]))
      OR bool_or(${TXT} ~* '\\yipmi\\y|idrac|\\yilo\\y|integrated lights-?out|supermicro|\\ybmc\\y|intel ?amt|redfish|\\ycimc\\y|\\ydrac\\y|baseboard management') THEN 'ipmi'
    WHEN bool_or(port = ANY(ARRAY[8006,902,903,16509]))
      OR bool_or(${TXT} ~* 'vmware|esxi|vsphere|proxmox|hyper-?v|xenserver|citrix hypervisor|\\ykvm\\y|libvirt|ovirt|nutanix|\\yqemu\\y') THEN 'hypervisor'
    WHEN bool_or(port = ANY(ARRAY[554,8554,37777,37778,34567]))
      OR bool_or(${TXT} ~* 'rtsp|hikvision|dahua|\\yaxis\\y|onvif|ip ?camera|ipcam|webcam|netcam|network camera|goahead|dvrdvs|\\ynvr\\y|\\ydvr\\y|vivotek|foscam|reolink|uniview') THEN 'camera'
    WHEN bool_or(port = ANY(ARRAY[9100,9101,9102,515,631]))
      OR bool_or(${TXT} ~* 'jetdirect|internet printing|\\yipp\\y|\\yprinter\\y|laserjet|officejet|deskjet|\\ypcl\\y|postscript|brother|kyocera|lexmark|\\yricoh\\y|xerox|\\ycanon\\y|\\yepson\\y|cups/|sharp mx') THEN 'printer'
    WHEN bool_or(port = ANY(ARRAY[5060,5061,2000]))
      OR bool_or(${TXT} ~* 'sip/2\\.0|asterisk|freeswitch|\\yvoip\\y|call ?manager|\\ysccp\\y|\\y3cx\\y|freepbx|kamailio|opensips|polycom|yealink|grandstream') THEN 'voip'
    WHEN bool_or(port = ANY(ARRAY[25565,19132,27015,7777,28015]))
      OR bool_or(${TXT} ~* 'minecraft|counter-strike|source engine|\\yvalve\\y|garry|\\ygmod\\y|rust server|\\yark\\y|terraria|factorio|fivem|\\ysamp\\y|teamspeak|steam') THEN 'game-server'
    WHEN bool_or(port = ANY(ARRAY[32400,8096,8920]))
      OR bool_or(${TXT} ~* 'plex|jellyfin|\\yemby\\y|\\ykodi\\y|dlna|mediaserver|serviio|airplay|chromecast|\\yroku\\y|\\ysonos\\y') THEN 'media-server'
    WHEN bool_or(port = ANY(ARRAY[5000,5001,548,2049,873]))
      OR bool_or(${TXT} ~* 'synology|diskstation|\\yqnap\\y|truenas|freenas|netapp|openmediavault|\\ynas\\y|\\ydsm\\y|\\ydrobo\\y|wd my cloud|buffalo|unraid') THEN 'nas'
    WHEN bool_or(port = ANY(ARRAY[3306,5432,1433,1521,27017,6379,9042,5984,11211,8123]))
      OR bool_or(${TXT} ~* 'mysql|mariadb|postgresql|postgres|mongodb|\\yredis\\y|sql server|\\yoracle\\y|cassandra|couchdb|memcached|clickhouse|elasticsearch|influxdb') THEN 'database'
    WHEN bool_or(port = ANY(ARRAY[25,465,587,110,143,993,995]))
      OR bool_or(${TXT} ~* '\\ysmtp\\y|esmtp|postfix|\\yexim\\y|sendmail|dovecot|\\yimap\\y|\\ypop3\\y|zimbra|exchange|courier|\\yqmail\\y|mail server') THEN 'mail-server'
    WHEN bool_or(port = 53)
      OR bool_or(${TXT} ~* '\\ybind\\y|\\ynamed\\y|dnsmasq|powerdns|unbound|\\ydns\\y|domain name') THEN 'dns-server'
    WHEN bool_or(port = ANY(ARRAY[7547,1900]))
      OR bool_or(${TXT} ~* 'openwrt|dd-wrt|\\yrouter\\y|residential gateway|\\ycpe\\y|tp-?link|d-?link|netgear|asuswrt|\\yzte\\y|home gateway|dsl|broadband') THEN 'router'
    WHEN bool_or(${TXT} ~* 'pfsense|sonicwall|cisco adaptive security|\\yasa\\y|pan-os|palo alto|globalprotect|checkpoint|check point|watchguard|\\ysophos\\y|mikrotik|routeros|opnsense|\\yfirewall\\y|juniper|junos|zyxel|draytek') THEN 'firewall'
    WHEN bool_or(${TXT} ~* 'haproxy|\\yf5\\y|big-?ip|nginx plus|traefik|\\yenvoy\\y|netscaler|\\ykemp\\y|\\ya10\\y|load ?balancer|\\yvarnish\\y') THEN 'load-balancer'
    WHEN bool_or(port = ANY(ARRAY[1883,8883,5683,8123]))
      OR bool_or(${TXT} ~* '\\ymqtt\\y|home assistant|tasmota|shelly|sonoff|espressif|esp8266|esp32|\\ytuya\\y|smartthings|\\yhue\\y|homekit|\\ycoap\\y|zigbee|z-wave') THEN 'iot'
    WHEN bool_or(port = 3389)
      OR bool_or(${TXT} ~* 'ms-wbt|remote desktop|terminal serv|microsoft-iis|windows server|\\ywin(32|64|dows)\\y|\\yrdp\\y') THEN 'windows-server'
    WHEN bool_or(port = ANY(ARRAY[62078,5555]))
      OR bool_or(${TXT} ~* 'iphone|\\yipad\\y|lockdownd|\\yandroid\\y|\\yadb\\y|dalvik') THEN 'mobile'
    WHEN bool_or(port = ANY(ARRAY[22,2222]))
      OR bool_or(${TXT} ~* 'ssh-2\\.0|openssh|dropbear|libssh') THEN 'ssh-server'
    WHEN bool_or(port = ANY(ARRAY[80,443,8080,8443,8000,8888,3000]))
      OR bool_or(${TXT} ~* 'server: ?(nginx|apache|iis|caddy|litespeed|openresty|lighttpd|tomcat|jetty)|http/1\\.|http/2|<html|<!doctype html') THEN 'web-server'
    ELSE 'unknown'
  END`;
}
