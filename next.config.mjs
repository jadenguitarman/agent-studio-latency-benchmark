import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function sharedPublicEnv(name) {
  if (process.env[name]) return process.env[name];

  try {
    const line = readFileSync(resolve(process.cwd(), '../.env'), 'utf8')
      .split(/\r?\n/)
      .find((candidate) => candidate.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  } catch {
    return undefined;
  }
}

export default {
  env: {
    NEXT_PUBLIC_SIGNALDOCK_BASE_URL: sharedPublicEnv('NEXT_PUBLIC_SIGNALDOCK_BASE_URL'),
    NEXT_PUBLIC_SIGNALDOCK_APP_KEY: sharedPublicEnv('NEXT_PUBLIC_SIGNALDOCK_APP_KEY'),
  },
};
