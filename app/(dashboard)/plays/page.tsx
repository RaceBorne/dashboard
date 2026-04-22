import { redirect } from 'next/navigation';

// Legacy route — the module was renamed Pipeline → Ventures. This
// keeps old bookmarks and any in-flight tabs working.
export default function PlaysRedirect() {
  redirect('/ventures');
}
