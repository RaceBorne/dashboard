import type { Prospect } from '@/lib/types';

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

/**
 * Mock prospects mid-test. These are targets from the medical campaign who've
 * had first-touch outreach and are now waiting for signals to come back.
 */
export const MOCK_PROSPECTS: Prospect[] = [
  {
    id: 'prospect_001',
    name: 'Mr Ajay Patel',
    org: 'Fortius Clinic',
    role: 'Consultant knee surgeon',
    email: 'ajay.patel@fortiusclinic.com',
    channel: 'email',
    status: 'replied_positive',
    playId: 'play_medical',
    sourceDetail: 'Fortius Clinic, London',
    createdAt: daysAgo(5),
    lastTouchAt: daysAgo(1),
    qualityScore: 86,
    signals: {
      emailValid: true,
      opened: true,
      clicked: true,
      replied: true,
      sentiment: 'positive',
    },
    outreach: [
      {
        id: 'o1',
        at: daysAgo(5),
        channel: 'email',
        subject: 'A rehab tool your knee patients would actually use',
        status: 'replied',
        replyExcerpt:
          '"Interesting — can you send a one-pager? Happy to have a call next week."',
      },
    ],
    notes:
      'High-signal — open + click + positive reply within 4 days. Ready for Lead promotion.',
  },
  {
    id: 'prospect_002',
    name: 'Ms Kerry Davis',
    org: 'Schoen Clinic London',
    role: 'Lead physiotherapist',
    email: 'kerry.davis@schoen-clinic.co.uk',
    channel: 'email',
    status: 'replied_neutral',
    playId: 'play_medical',
    sourceDetail: 'Schoen Clinic London',
    createdAt: daysAgo(5),
    lastTouchAt: daysAgo(2),
    qualityScore: 62,
    signals: {
      emailValid: true,
      opened: true,
      clicked: false,
      replied: true,
      sentiment: 'neutral',
    },
    outreach: [
      {
        id: 'o1',
        at: daysAgo(5),
        channel: 'email',
        subject: 'A rehab tool your knee patients would actually use',
        status: 'replied',
        replyExcerpt:
          '"Thanks for getting in touch — not something I can commit to right now, but please send your leaflet when it\'s ready."',
      },
    ],
    notes: 'Soft yes. Nurture, not a hot lead. Keep in the play flow.',
  },
  {
    id: 'prospect_003',
    name: 'Dr Felix Schreiber',
    org: 'London Bridge Orthopaedic',
    role: 'Consultant surgeon',
    email: 'f.schreiber@londonbridge-ortho.co.uk',
    channel: 'email',
    status: 'no_reply',
    playId: 'play_medical',
    sourceDetail: 'London Bridge Orthopaedic',
    createdAt: daysAgo(5),
    lastTouchAt: daysAgo(5),
    qualityScore: 40,
    signals: {
      emailValid: true,
      opened: true,
      clicked: false,
      replied: false,
    },
    outreach: [
      {
        id: 'o1',
        at: daysAgo(5),
        channel: 'email',
        subject: 'A rehab tool your knee patients would actually use',
        status: 'opened',
      },
    ],
    notes: 'Opened but no response after 5 days. Ready for step 2 follow-up.',
  },
  {
    id: 'prospect_004',
    name: 'Mr Oliver Lang',
    org: 'Bupa Cromwell Hospital',
    role: 'Consultant orthopaedic surgeon',
    email: 'oliver.lang@bupacromwell.co.uk',
    channel: 'email',
    status: 'bounced',
    playId: 'play_medical',
    sourceDetail: 'Bupa Cromwell Hospital',
    createdAt: daysAgo(5),
    lastTouchAt: daysAgo(5),
    qualityScore: 0,
    signals: {
      emailValid: false,
    },
    outreach: [
      {
        id: 'o1',
        at: daysAgo(5),
        channel: 'email',
        status: 'bounced',
      },
    ],
    notes: 'Hard bounce. Email pattern likely wrong. Find a better address or archive.',
  },
  {
    id: 'prospect_005',
    name: 'Ms Priya Das',
    org: 'Nuffield Health Cheltenham',
    role: 'Rehab lead',
    email: 'priya.das@nuffieldhealth.com',
    channel: 'email',
    status: 'sent',
    playId: 'play_medical',
    sourceDetail: 'Nuffield Health Cheltenham',
    createdAt: daysAgo(1),
    lastTouchAt: daysAgo(1),
    qualityScore: 50,
    signals: {
      emailValid: true,
    },
    outreach: [
      {
        id: 'o1',
        at: daysAgo(1),
        channel: 'email',
        subject: 'A rehab tool your knee patients would actually use',
        status: 'sent',
      },
    ],
  },
  {
    id: 'prospect_006',
    name: 'Mr Gareth Nolan',
    org: 'Spire Southampton',
    role: 'Consultant',
    email: 'gareth.nolan@spirehealthcare.com',
    channel: 'email',
    status: 'replied_negative',
    playId: 'play_medical',
    sourceDetail: 'Spire Southampton',
    createdAt: daysAgo(6),
    lastTouchAt: daysAgo(3),
    qualityScore: 15,
    signals: {
      emailValid: true,
      opened: true,
      replied: true,
      sentiment: 'negative',
    },
    outreach: [
      {
        id: 'o1',
        at: daysAgo(6),
        channel: 'email',
        status: 'replied',
        replyExcerpt:
          '"We don\'t recommend products to patients. Please don\'t contact me again."',
      },
    ],
    notes: 'Hard no. Suppress.',
  },
];
