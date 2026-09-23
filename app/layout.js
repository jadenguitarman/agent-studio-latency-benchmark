import { SignalDockPageView } from '../components/SignalDockPageView';

export const metadata = {
  title: 'Where does Agent Studio latency come from?',
  description: 'A controlled benchmark that separates search, model, and orchestration time.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head><link rel="stylesheet" href="/styles.css" /></head>
      <body><SignalDockPageView />{children}</body>
    </html>
  );
}
