import type { Thread } from '@/lib/types';

const isoDaysAgo = (n: number, hours = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(d.getHours() - hours);
  return d.toISOString();
};

const craig = { name: 'Craig McDonald', email: 'craig@evari.cc', role: 'evari' as const };

export const MOCK_THREADS: Thread[] = [
  {
    id: 'thr_001',
    subject: 'Your Evari Tour configuration — saved and ready when you are',
    leadId: 'lead_001',
    status: 'awaiting_us',
    labels: ['Evari/Leads', 'pipeline'],
    participants: [
      craig,
      { name: 'James Pemberton', email: 'james.pemberton@gmail.com', role: 'lead' },
    ],
    lastMessageAt: isoDaysAgo(0, 3),
    unread: true,
    messages: [
      {
        id: 'm1',
        from: craig,
        to: [{ name: 'James Pemberton', email: 'james.pemberton@gmail.com', role: 'lead' }],
        sentAt: isoDaysAgo(6, -1),
        isFromEvari: true,
        bodyMarkdown: `James,

Your configuration is saved. Matt anthracite, Performance Line CX, Brooks B17 — exactly as you left it.

I don't want to chase. I want to make sure the answer is right. Reply when you have a question, or come and ride one. We have one set up at Cobham this Saturday.

Craig
Evari`,
      },
      {
        id: 'm2',
        from: { name: 'James Pemberton', email: 'james.pemberton@gmail.com', role: 'lead' },
        to: [craig],
        sentAt: isoDaysAgo(5),
        isFromEvari: false,
        bodyMarkdown: `Hi Craig,

Thanks for the soft touch. Three things:

1. **Weight** — what's the all-up with the Bosch and a 750Wh battery?
2. **Range** — realistic on a hilly Surrey loop, eco mode, my weight (84kg)?
3. **Finance** — you mention 0% on the site. Over how long, and is there an arrangement fee?

I'll come down Saturday either way.

James`,
      },
      {
        id: 'm3',
        from: craig,
        to: [{ name: 'James Pemberton', email: 'james.pemberton@gmail.com', role: 'lead' }],
        sentAt: isoDaysAgo(4),
        isFromEvari: true,
        bodyMarkdown: `James,

Direct answers:

1. **22.4 kg all-up** with the 750Wh and the Brooks. The carbon mainframe is the difference — most equivalents come in around 26-28 kg.
2. **80-110 km in eco** on Surrey rolling, your weight, factoring traffic stops. We've ridden the Devil's Punchbowl loop on a single charge with headroom.
3. **0% over 24 months**, no arrangement fee, no balloon. Soft credit check. We use Klarna.

See you Saturday at 11:30. The bike will be on stand 3.

Craig`,
      },
      {
        id: 'm4',
        from: { name: 'James Pemberton', email: 'james.pemberton@gmail.com', role: 'lead' },
        to: [craig],
        sentAt: isoDaysAgo(0, 3),
        isFromEvari: false,
        bodyMarkdown: `Brilliant — see you Saturday. One last thing — can I bring my wife? She's curious now.`,
      },
    ],
  },
  {
    id: 'thr_002',
    subject: 'Pyrenees in September — two Evari Tours',
    leadId: 'lead_002',
    status: 'awaiting_us',
    labels: ['Evari/Leads', 'EU'],
    participants: [
      craig,
      { name: 'Anneke de Vries', email: 'anneke.devries@kpn.nl', role: 'lead' },
    ],
    lastMessageAt: isoDaysAgo(1),
    unread: true,
    messages: [
      {
        id: 'm1',
        from: { name: 'Anneke de Vries', email: 'anneke.devries@kpn.nl', role: 'lead' },
        to: [craig],
        sentAt: isoDaysAgo(3),
        isFromEvari: false,
        bodyMarkdown: `Dear Evari,

My partner Pieter and I are planning a Pyrenees tour in September. We are both experienced cyclists. We are looking at two e-tourers and the Evari Tour is at the top of our shortlist.

I am 168cm / 64kg. Pieter is 184cm / 88kg. We cruise around 27km/h on flatter sections.

Could you help us with sizing, and clarify EU shipping and import duties to the Netherlands?

Thank you,
Anneke`,
      },
      {
        id: 'm2',
        from: craig,
        to: [{ name: 'Anneke de Vries', email: 'anneke.devries@kpn.nl', role: 'lead' }],
        sentAt: isoDaysAgo(3, -2),
        isFromEvari: true,
        bodyMarkdown: `Anneke,

Thank you for considering us. Sizing first, then shipping.

**Sizing**
- You: 168cm at 64kg — Tour S, 100mm stem, 27.2 setback post.
- Pieter: 184cm at 88kg — Tour L, 110mm stem, straight post.

We can fine-tune from a video fit on a turbo, free of charge.

**Shipping and duty (NL)**
- Crated, fully insured, door-to-door — €420 per bike.
- 21% Dutch VAT applies on import; we handle the paperwork at our end.
- Lead time: 6-8 weeks from order, including the Kustomflow finish.

I will follow up with the formal sizing PDF tomorrow.

Craig`,
      },
      {
        id: 'm3',
        from: { name: 'Anneke de Vries', email: 'anneke.devries@kpn.nl', role: 'lead' },
        to: [craig],
        sentAt: isoDaysAgo(2),
        isFromEvari: false,
        bodyMarkdown: `Wonderful, thank you. One more question — for the Pyrenees, would you put us on the Performance Line CX, or is there something we should consider for the climbs?`,
      },
      {
        id: 'm4',
        from: craig,
        to: [{ name: 'Anneke de Vries', email: 'anneke.devries@kpn.nl', role: 'lead' }],
        sentAt: isoDaysAgo(1),
        isFromEvari: true,
        bodyMarkdown: `Anneke,

The Performance Line CX is exactly the right motor for the Pyrenees. 85Nm, full power up to 25 km/h, and the eMTB mode reads your effort and feathers the assist on long climbs so you don't run the battery dry.

If you wanted absolute headroom, we could specify the dual-battery system — 750Wh internal plus a 250Wh PowerPack on the downtube. That brings the all-day range up considerably for back-to-back col days.

I'll include both options on your formal quote.

Craig`,
      },
    ],
  },
  {
    id: 'thr_004',
    subject: 'Champagne pearl finish — your bespoke Evari Tour',
    leadId: 'lead_004',
    status: 'awaiting_lead',
    labels: ['Evari/Leads', 'bespoke'],
    participants: [
      craig,
      { name: 'Phoebe Carrington', email: 'phoebe.c@gallop-pr.co.uk', role: 'lead' },
    ],
    lastMessageAt: isoDaysAgo(2),
    unread: false,
    messages: [
      {
        id: 'm1',
        from: craig,
        to: [{ name: 'Phoebe Carrington', email: 'phoebe.c@gallop-pr.co.uk', role: 'lead' }],
        sentAt: isoDaysAgo(2),
        isFromEvari: true,
        bodyMarkdown: `Phoebe,

Your bespoke quote, attached.

A few notes alongside the figures:

- **Champagne pearl base** with a soft pearl flake, hand-laid by Kustomflow. Twelve hours in the booth, six in the bake.
- **Anodised hardware** in matching warm bronze — bolts, headset cap, seat clamp.
- **Brooks Cambium C17** in natural rubber. Quietly beautiful, weatherproof.
- Lead time **9 weeks** to allow for paint, cure, and a slow build.

We've held a paint slot for you next month. Confirm by Friday and we begin.

Craig`,
      },
    ],
  },
  {
    id: 'thr_007',
    subject: 'A pair of Commuters for the household',
    leadId: 'lead_007',
    status: 'open',
    labels: ['Evari/Leads', 'pair'],
    participants: [
      craig,
      { name: 'Daniel Okonkwo', email: 'dan@longshorelegal.com', role: 'lead' },
    ],
    lastMessageAt: isoDaysAgo(1),
    unread: false,
    messages: [
      {
        id: 'm1',
        from: { name: 'Daniel Okonkwo', email: 'dan@longshorelegal.com', role: 'lead' },
        to: [craig],
        sentAt: isoDaysAgo(2),
        isFromEvari: false,
        bodyMarkdown: `Following our call — would Saturday morning work for both of us to come and ride a Commuter pair? Chiswick to your showroom is doable for us.`,
      },
      {
        id: 'm2',
        from: craig,
        to: [{ name: 'Daniel Okonkwo', email: 'dan@longshorelegal.com', role: 'lead' }],
        sentAt: isoDaysAgo(1),
        isFromEvari: true,
        bodyMarkdown: `Daniel,

Saturday at 10:30 — two Commuters set up, one in your size, one in your wife's. We'll loop the Hammersmith embankment and back.

Craig`,
      },
    ],
  },
  {
    id: 'thr_008',
    subject: 'Cycle-to-work for Aurora Architects partners',
    leadId: 'lead_008',
    status: 'awaiting_us',
    labels: ['Evari/Leads', 'corporate'],
    participants: [
      craig,
      { name: 'Sarah Mitchell', email: 'sm@aurora-architects.co.uk', role: 'lead' },
    ],
    lastMessageAt: isoDaysAgo(0, 8),
    unread: true,
    messages: [
      {
        id: 'm1',
        from: { name: 'Sarah Mitchell', email: 'sm@aurora-architects.co.uk', role: 'lead' },
        to: [craig],
        sentAt: isoDaysAgo(0, 8),
        isFromEvari: false,
        bodyMarkdown: `Hi Craig,

Following up on LinkedIn — six partners at the firm are interested in upgrading their commute. Could we discuss whether Evari fits within the cycle-to-work scheme limits, or whether we'd be better off purchasing outright through the firm?

Sarah`,
      },
    ],
  },
];

