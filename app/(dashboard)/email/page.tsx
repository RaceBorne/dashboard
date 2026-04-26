import { redirect } from 'next/navigation';

// Email parent route — no landing UI yet, just deep-link into the
// first sub-page (Contacts). Future phases will replace this with
// an Email overview dashboard.
export default function EmailIndexPage() {
  redirect('/email/contacts');
}
