import type { Play } from '@/lib/types';

const NOW = new Date().toISOString();
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

export const MOCK_PLAYS: Play[] = [
  // The medical-practices play — Craig's example, pre-populated through
  // Researching stage so the UI has real content to show.
  {
    id: 'play_medical',
    title: 'Post-op care partnerships — private orthopaedic clinics',
    brief:
      'Private orthopaedic surgeons and physios in the UK include post-op care notices for knee and hip patients. Evari supplies a demo bike to the clinic, trains the staff, and gives a referral commission on each bike sold to a patient who came through them. Co-branded patient leaflet positions the ebike as part of the rehab protocol.',
    stage: 'researching',
    createdAt: daysAgo(9),
    updatedAt: daysAgo(1),
    ownerName: 'Craig',
    tags: ['medical', 'partnerships', 'rehab'],
    pinned: true,

    research: [
      {
        id: 'r1',
        title: 'NHS vs private split — UK knee replacements',
        body: 'NHS performs ~110k knee replacements/year. Private sector ~35k (Bupa, Spire, Nuffield, Ramsay). Private patients skew older, higher income, greater willingness to spend on private rehab equipment. Target private first — shorter sales cycle.',
        at: daysAgo(7),
        sourceUrl: 'https://www.nicor.org.uk',
        tags: ['market-size'],
      },
      {
        id: 'r2',
        title: 'Ebikes as rehab — clinical evidence snapshot',
        body: 'Low-impact cycling is a standard post-ACL and TKR rehab modality. Ebikes specifically cited in two 2024 physio journal pieces as lowering adherence dropoff. Evari can commission its own small outcomes study to add to the pack.',
        at: daysAgo(6),
        sourceUrl: 'https://journals.physiotherapyevidence.com/',
        tags: ['clinical'],
      },
      {
        id: 'r3',
        title: 'Initial target list — 28 private clinics',
        body: 'Started with Sports & Spinal Surgery (Cheltenham), London Bridge Orthopaedic, Fortius Clinic, Schoen Clinic, Nuffield Cheltenham, Spire Southampton — expanding to 50. Each has a named lead consultant visible on their website. Email patterns consistent (first.last@clinic-domain).',
        at: daysAgo(3),
        tags: ['list', 'scraping'],
      },
    ],

    targets: [
      {
        id: 't1',
        name: 'Dr Sarah Mitchell',
        org: 'Aurora Sports Medicine',
        role: 'Consultant orthopaedic surgeon',
        email: 's.mitchell@aurorasportsmed.co.uk',
        channel: 'email',
        status: 'replied',
        notes:
          'Already an active lead (lead_013). Wants to pilot with 10 patients. Benchmark target for the rest.',
      },
      {
        id: 't2',
        name: 'Mr Ajay Patel',
        org: 'Fortius Clinic',
        role: 'Consultant knee surgeon',
        email: 'ajay.patel@fortiusclinic.com',
        channel: 'email',
        status: 'new',
      },
      {
        id: 't3',
        name: 'Ms Kerry Davis',
        org: 'Schoen Clinic London',
        role: 'Lead physiotherapist',
        email: 'kerry.davis@schoen-clinic.co.uk',
        channel: 'email',
        status: 'new',
      },
      {
        id: 't4',
        name: 'Dr Felix Schreiber',
        org: 'London Bridge Orthopaedic',
        role: 'Consultant surgeon',
        email: 'f.schreiber@londonbridge-ortho.co.uk',
        channel: 'email',
        status: 'new',
      },
    ],

    messaging: [
      {
        id: 'm1',
        channel: 'email',
        sequenceStep: 1,
        subject: 'A rehab tool your knee patients would actually use',
        body:
          'Dear {{first_name}},\n\nEvari makes speed-bikes built by hand in Britain. A number of your peers — including Dr Sarah Mitchell at Aurora — have started including ebike use in their TKR rehab protocols, because adherence on low-impact cycling beats just about everything else.\n\nI would like to send you a demo bike for a month, at no cost, so your physios can try it with a handful of suitable patients. If it helps them, we pay you a referral on any bike sold to one of your patients.\n\nShall we find 15 minutes to talk?\n\nCraig',
      },
      {
        id: 'm2',
        channel: 'email',
        sequenceStep: 2,
        subject: 'Following up — demo bike offer',
        body:
          'Hi {{first_name}},\n\nWanted to make sure my note from last week reached you. No pressure either way — happy to send over a one-pager if email suits you better than a call.\n\nCraig',
      },
    ],

    chat: [
      {
        id: 'c1',
        role: 'user',
        at: daysAgo(9),
        content:
          'I want to explore partnerships with private medical practices who see patients post-surgery. The idea: they recommend an ebike for rehab and we have a scheme with them. What do we actually need to figure out?',
      },
      {
        id: 'c2',
        role: 'assistant',
        at: daysAgo(9),
        content:
          'Four things to work out before any outreach:\n\n1. **Who exactly.** Private knee surgeons and TKR physios have the tightest evidence base; private spine surgeons too. Start knee, then branch.\n2. **What we offer them.** A demo bike + referral commission is the simplest ask; a co-branded patient leaflet raises the perceived legitimacy without costing much.\n3. **Evidence pack.** Two or three clinical citations + an Evari outcomes study commitment. Takes the conversation from "marketing" to "clinical adjunct".\n4. **The patient leaflet.** If the surgeon hands this to a patient post-op, the surgeon is vouching for us. Needs to be medically sober, not a product ad.\n\nOrder I would work in: evidence pack → leaflet draft → target list → outreach. The leaflet is the proof.',
      },
      {
        id: 'c3',
        role: 'user',
        at: daysAgo(7),
        pinned: true,
        content:
          'Pin that order. Start with the evidence pack. Who should I interview?',
      },
      {
        id: 'c4',
        role: 'assistant',
        at: daysAgo(7),
        content:
          'Two physios and one orthopaedic consultant is enough to quote. Sarah Mitchell at Aurora (already a warm lead) is an obvious first call. For physios — try Adam Meakins (London, big social profile, blunt) and Tom Goom (running physio, known for writing). Your goal is a 20-minute call where they say "yes, low-impact cycling is a standard modality" on the record — you use their names with permission in the leaflet.',
      },
    ],

    activity: [
      {
        id: 'a1',
        at: daysAgo(9),
        summary: 'Play created — idea',
        type: 'created',
      },
      {
        id: 'a2',
        at: daysAgo(9),
        summary: 'Chat: defined the four workstreams (evidence, leaflet, list, outreach)',
        type: 'chat',
      },
      {
        id: 'a3',
        at: daysAgo(7),
        summary: 'Moved to researching',
        type: 'stage_change',
      },
      {
        id: 'a4',
        at: daysAgo(6),
        summary: 'Added research: NHS/private split, clinical evidence',
        type: 'note',
      },
      {
        id: 'a5',
        at: daysAgo(3),
        summary: 'Seeded initial target list — 28 private clinics',
        type: 'target_added',
      },
    ],

    taskIds: ['t-med-001', 't-med-002', 't-med-003'],

    links: [
      { label: '/rehab landing page (draft)', url: '/pages' },
      { label: 'Dr Mitchell — active lead', url: '/leads/lead_013' },
    ],
  },

  // Shelved idea — hasn't been worked on yet
  {
    id: 'play_commute',
    title: 'Corporate cycle-to-work — fleet packages',
    brief:
      'Mid-sized UK employers (300-2000 staff) running cycle-to-work schemes. Offer a "fleet" package: 10-50 Evari Commute bikes at a discount, with on-site fit day, quarterly service, and a named account rep. Pilot with one London tech firm first.',
    stage: 'idea',
    createdAt: daysAgo(4),
    updatedAt: daysAgo(4),
    ownerName: 'Craig',
    tags: ['corporate', 'fleet', 'commute'],
    research: [],
    targets: [],
    messaging: [],
    chat: [
      {
        id: 'c1',
        role: 'user',
        at: daysAgo(4),
        content:
          "Parking this here. Corporate cycle-to-work schemes — we could do fleet deals. Come back when the medical one is in flight.",
      },
    ],
    activity: [
      {
        id: 'a1',
        at: daysAgo(4),
        summary: 'Play created — idea (shelved)',
        type: 'created',
      },
    ],
  },

  // Another shelved idea
  {
    id: 'play_cycling_press',
    title: 'Long-term review loans — cycling press',
    brief:
      'Place three Evari Tour bikes with three UK cycling journalists for 6-month reviews. Deliverables: long-form feature + two social posts + a 3-month follow-up. Backlinks + brand authority.',
    stage: 'idea',
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
    ownerName: 'Craig',
    tags: ['press', 'pr', 'backlinks'],
    research: [],
    targets: [
      {
        id: 't1',
        name: 'Hugo Blackwood',
        org: 'road.cc',
        role: 'Commissioning editor',
        email: 'hugo.blackwood@road.cc',
        channel: 'email',
        status: 'replied',
        notes: 'Already an active lead (lead_017). Agreed in principle, awaiting contract.',
      },
    ],
    messaging: [],
    chat: [],
    activity: [
      {
        id: 'a1',
        at: daysAgo(2),
        summary: 'Play created — road.cc in progress as lead',
        type: 'created',
      },
    ],
  },
];

export function getMockPlay(id: string): Play | undefined {
  return MOCK_PLAYS.find((c) => c.id === id);
}
