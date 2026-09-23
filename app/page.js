import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default function Page() {
  const html = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf8');
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;

  return (
    <>
      <main dangerouslySetInnerHTML={{ __html: body }} />
      <script type="module" src="/app.js" />
    </>
  );
}
