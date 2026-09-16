import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Artifacts do not receive GitHub's console secret masking. Sanitize before
// either printing or archiving; never upload the raw ossutil_output directory.
export function redactOssReport(text, env = process.env) {
  const secrets = Object.entries(env)
    .filter(([name, value]) => /ACCESS_?KEY|SECRET|TOKEN/i.test(name) && value)
    .flatMap(([, value]) => [value, encodeURIComponent(value)])
    .sort((a, b) => b.length - a.length);
  for (const secret of secrets) text = text.replaceAll(secret, '[REDACTED]');
  return text
    .replace(/(\b(?:Authorization|x-oss-security-token)\s*[:=]\s*)[^\r\n]*/gi, '$1[REDACTED]')
    .replace(/(<(?:SecurityToken|AccessKeySecret|SignatureProvided)>)[\s\S]*?(<\/[^>]+>)/gi, '$1[REDACTED]$2')
    .replace(/(https?:\/\/[^\s<>"'?]+)\?[^\s<>"']*/gi, '$1?[REDACTED]');
}

export async function collectOssReports(source = 'ossutil_output', destination = 'test-results/oss-deploy', env = process.env) {
  const entries = await readdir(source, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const reports = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.report')).sort((a, b) => a.name.localeCompare(b.name));
  const sections = [];
  for (const report of reports) {
    const content = redactOssReport(await readFile(join(source, report.name), 'utf8'), env);
    sections.push(`Report: ${report.name}\n${content}`);
  }
  const result = sections.join('\n\n') || 'No ossutil .report file was created. Inspect the failed upload step for a local configuration or command error.\n';
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, 'ossutil-report.txt'), result);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await collectOssReports();
  // Prefix external error text so it cannot become a GitHub workflow command.
  for (const line of report.slice(0, 24000).split(/\r?\n/)) console.log(`ossutil | ${line}`);
  if (report.length > 24000) console.log('See the sanitized diagnostic artifact for the full report.');
}
