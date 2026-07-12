import { sql, type SQL } from 'drizzle-orm';

// SQL mirror of lib/classify.ts, for dataset-wide filtering/counting by device
// type (the JS classifier only runs over rows already fetched). Aggregates per
// IP with bool_or over each row's port + text signals, in the SAME specificity
// order as the JS classifier — CASE returns the first match, which lines up with
// the JS scoring because the more-specific categories carry the heavier signals.
//
// Use as a grouped expression: SELECT ip, <deviceTypeCaseSql> ... GROUP BY ip,
// or in HAVING to filter. `\y` is Postgres' word boundary (POSIX ARE).
const TXT = sql`concat_ws(' ', service, product, banner, headers)`;

// NOTE: this is a template literal, so every backslash meant for the Postgres
// regex must be doubled (`\\y` → `\y`), otherwise `\y`/`\.` collapse to `y`/`.`
// and the word boundaries silently vanish.
export function deviceTypeCaseSql(): SQL {
  return sql`CASE
    WHEN bool_or(port = ANY(ARRAY[554,8554,37777,37778,34567]))
      OR bool_or(${TXT} ~* 'rtsp|hikvision|dahua|onvif|ip ?camera|ipcam|webcam|netcam|network camera|goahead|dvrdvs|vivotek|foscam|reolink|uniview|\\ynvr\\y|\\ydvr\\y|\\yaxis\\y') THEN 'camera'
    WHEN bool_or(port = ANY(ARRAY[9100,9101,9102,515,631]))
      OR bool_or(${TXT} ~* 'jetdirect|internet printing|laserjet|officejet|deskjet|postscript|brother|kyocera|lexmark|xerox|cups/|sharp mx|\\yipp\\y|\\yprinter\\y|\\ypcl\\y|\\yricoh\\y|\\ycanon\\y|\\yepson\\y') THEN 'printer'
    WHEN bool_or(${TXT} ~* 'pfsense|sonicwall|cisco adaptive security|pan-os|palo alto|globalprotect|checkpoint|check point|watchguard|sophos|mikrotik|routeros|opnsense|firewall|juniper|junos|zyxel|draytek|\\yasa\\y') THEN 'firewall'
    WHEN bool_or(port = 3389)
      OR bool_or(${TXT} ~* 'ms-wbt|remote desktop|terminal serv|microsoft-iis|windows server|\\yrdp\\y|\\ywin(32|64|dows)\\y') THEN 'windows-server'
    WHEN bool_or(port = ANY(ARRAY[62078,5555]))
      OR bool_or(${TXT} ~* 'iphone|lockdownd|dalvik|\\yipad\\y|\\yandroid\\y|\\yadb\\y') THEN 'mobile'
    WHEN bool_or(port = ANY(ARRAY[22,2222]))
      OR bool_or(${TXT} ~* 'ssh-2\\.0|openssh|dropbear|libssh') THEN 'ssh-server'
    WHEN bool_or(port = ANY(ARRAY[80,443,8080,8443,8000,8888,3000]))
      OR bool_or(${TXT} ~* 'server: ?(nginx|apache|iis|caddy|litespeed|openresty|lighttpd|tomcat|jetty)|http/1\\.|http/2|<html|<!doctype html') THEN 'web-server'
    ELSE 'unknown'
  END`;
}
