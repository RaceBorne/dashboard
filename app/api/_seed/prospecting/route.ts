import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  Lead,
  Play,
  PlayActivityEvent,
  PlayChatMessage,
  PlayStrategy,
} from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/_seed/prospecting
 *
 * One-shot seeder. Drops three fully-wired prospecting flows into
 * Supabase so the operator can walk Idea -> Strategy -> Discovery ->
 * Shortlist -> Enrichment -> Leads end-to-end without having to create
 * anything by hand. Idempotent: writes use upsert keyed on the seeded
 * play / lead ids, so hitting this endpoint twice replaces the same
 * three plays rather than duplicating.
 */
interface SeedSpec {
  id: string;                 // play id, deterministic for idempotency
  title: string;
  pitch: string;              // play.brief
  category: string;
  strategy: PlayStrategy;
  strategyShort: string;
  brief: {
    campaignName: string;
    objective: string;
    targetAudience: string[];
    geography: string;
    industries: string[];
    companySizeMin: number;
    companySizeMax: number;
    revenueMin: string;
    revenueMax: string;
    channels: string[];
    messaging: { angle: string; line: string }[];
    successMetrics: { name: string; target: string }[];
    idealCustomer: string;
  };
  chat: { role: 'user' | 'assistant'; content: string }[];
  /** Companies seeded into the funnel, with stage progression. */
  companies: SeedCompany[];
}

interface SeedCompany {
  name: string;
  domain: string;
  industry: string;
  size?: string;
  revenue?: string;
  location: string;
  fitScore: number;
  /** Where in the funnel this company sits. */
  stage: 'discovery' | 'shortlist' | 'enrichment' | 'lead';
  contacts?: { fullName: string; jobTitle: string; email: string; phone?: string; linkedin?: string }[];
}

const NOW = () => new Date().toISOString();

const SEEDS: SeedSpec[] = [
  {
    id: 'play-seed-knee',
    title: 'Private knee surgery clinics',
    pitch:
      'Partner with private orthopaedic clinics to put the Evari 856 in front of post-surgery patients during cycling rehab.',
    category: 'Private knee surgery clinics',
    strategyShort:
      'UK private orthopaedic consultants who prescribe cycling for post-knee-surgery rehab; sell them the 856 as low-impact training.',
    strategy: {
      hypothesis:
        'Private orthopaedic surgeons recommend cycling for knee rehab and want a credible bike to point patients toward.',
      sector: 'UK private orthopaedic clinics, knee specialism',
      targetPersona: 'Consultant orthopaedic surgeon (knee), or private clinic operations director',
      messagingAngles: [
        'A bike your post-op patients will actually use',
        'Low-impact cycling that protects the joint',
        'White-label dealer programme for clinics',
      ],
      weeklyTarget: 12,
      successMetrics: ['10 booked clinic visits in 90 days', '3 paid pilot programmes', 'First clinic referral'],
      disqualifiers: ['NHS-only clinics', 'Spinal-only practices'],
    },
    brief: {
      campaignName: 'Knee rehab partner programme',
      objective:
        'Land 3 paid pilot programmes with private orthopaedic clinics by Q3, generating a steady patient referral channel.',
      targetAudience: ['Consultant orthopaedic surgeons (knee)', 'Private clinic operations directors'],
      geography: 'United Kingdom',
      industries: ['Private healthcare', 'Orthopaedic clinics', 'Sports medicine'],
      companySizeMin: 3,
      companySizeMax: 50,
      revenueMin: '£500K',
      revenueMax: '£20M',
      channels: ['email', 'phone', 'event'],
      messaging: [
        { angle: 'Patient outcomes', line: 'A bike your post-op patients will actually want to ride.' },
        { angle: 'Low-impact training', line: 'The 856 protects the joint while rebuilding strength.' },
        { angle: 'Clinic dealer programme', line: 'White-label referral fees on every patient sale.' },
      ],
      successMetrics: [
        { name: 'Pilot clinics signed', target: '3 by end of Q3' },
        { name: 'Patient referrals', target: '10 in first 90 days' },
        { name: 'First clinic order', target: 'Within 60 days of pilot' },
      ],
      idealCustomer:
        'A 5-15 person UK private orthopaedic clinic specialising in knee surgery, with an active rehab programme already prescribing cycling.',
    },
    chat: [
      { role: 'user', content: 'Private knee surgery clinics. Get more customers via consultants who prescribe cycling for post-op rehab.' },
      { role: 'assistant', content: '**Hypothesis** Private orthopaedic surgeons recommend cycling for knee rehab and want a credible bike to point patients toward.\n\n**Sector & geography** UK private orthopaedic clinics, knee specialism.\n\n**Target persona** Consultant orthopaedic surgeon (knee), or private clinic operations director.\n\n**Messaging angles**\n1. A bike your post-op patients will actually use.\n2. Low-impact cycling that protects the joint.\n3. White-label dealer programme for clinics.\n\n**Success metrics**\n- 10 booked clinic visits in 90 days\n- 3 paid pilot programmes\n- First clinic referral\n\n**Disqualifiers** NHS-only clinics, spinal-only practices.' },
    ],
    companies: [
      { name: 'Capital Orthopaedics London',  domain: 'capitalortho.co.uk',     industry: 'Private healthcare', size: '11-50',  revenue: '£3M-£5M',   location: 'London, UK',     fitScore: 92, stage: 'lead',
        contacts: [
          { fullName: 'Dr James Hartwell', jobTitle: 'Consultant Knee Surgeon', email: 'j.hartwell@capitalortho.co.uk', phone: '+44 20 7100 0001', linkedin: 'https://linkedin.com/in/jameshartwell' },
          { fullName: 'Sarah Mendel',      jobTitle: 'Operations Director',     email: 'sarah@capitalortho.co.uk' },
        ] },
      { name: 'Harley Knee Clinic',           domain: 'harleyknee.com',         industry: 'Orthopaedic clinic', size: '5-10',   revenue: '£1M-£3M',   location: 'London, UK',     fitScore: 88, stage: 'enrichment',
        contacts: [
          { fullName: 'Dr Anna Whitfield',   jobTitle: 'Founder & Lead Surgeon', email: 'awhitfield@harleyknee.com' },
        ] },
      { name: 'Manchester Sports Ortho',      domain: 'manchesterso.uk',        industry: 'Sports medicine',    size: '11-50',  revenue: '£3M-£5M',   location: 'Manchester, UK', fitScore: 84, stage: 'enrichment',
        contacts: [
          { fullName: 'Dr Mark Patel',     jobTitle: 'Director of Rehabilitation', email: 'm.patel@manchesterso.uk', linkedin: 'https://linkedin.com/in/markpatelortho' },
        ] },
      { name: 'Edinburgh Knee Centre',        domain: 'edinburghknee.co.uk',    industry: 'Private healthcare', size: '5-10',   revenue: '£500K-£1M', location: 'Edinburgh, UK',  fitScore: 81, stage: 'shortlist' },
      { name: 'The Surrey Joint Clinic',      domain: 'surreyjoint.co.uk',      industry: 'Orthopaedic clinic', size: '11-50',  revenue: '£3M-£5M',   location: 'Surrey, UK',     fitScore: 78, stage: 'shortlist' },
      { name: 'Bristol Orthopaedic Partners', domain: 'bristolorthopartners.co.uk', industry: 'Orthopaedic clinic', size: '5-10', revenue: '£1M-£3M',  location: 'Bristol, UK',    fitScore: 75, stage: 'shortlist' },
      { name: 'Leeds Knee Specialists',       domain: 'leedsknee.com',          industry: 'Private healthcare', size: '5-10',   revenue: '£500K-£1M', location: 'Leeds, UK',      fitScore: 71, stage: 'discovery' },
      { name: 'Birmingham Sports Med',        domain: 'birminghamsportsmed.co.uk', industry: 'Sports medicine', size: '11-50', revenue: '£3M-£5M',   location: 'Birmingham, UK', fitScore: 68, stage: 'discovery' },
      { name: 'Cambridge Joint Centre',       domain: 'cambridgejoint.co.uk',   industry: 'Orthopaedic clinic', size: '5-10',   revenue: '£500K-£1M', location: 'Cambridge, UK',  fitScore: 64, stage: 'discovery' },
      { name: 'Brighton Knee Practice',       domain: 'brightonkneepractice.co.uk', industry: 'Private healthcare', size: '1-4', revenue: '£500K-£1M', location: 'Brighton, UK', fitScore: 60, stage: 'discovery' },
    ],
  },
  {
    id: 'play-seed-luxe-cars',
    title: 'Mayfair luxury car dealerships',
    pitch:
      'Partner with luxury car dealers in central London whose clients want a matching premium bike for the country house.',
    category: 'Mayfair luxury car dealerships',
    strategyShort:
      'Mayfair and Knightsbridge supercar dealerships whose clientele are HNW collectors looking for complementary luxury toys.',
    strategy: {
      hypothesis:
        'Supercar dealers want premium accessory partners; the 856 fits naturally as a country-estate companion to the cars they sell.',
      sector: 'London luxury car dealerships, supercar segment',
      targetPersona: 'Dealer principal or marketing director at boutique supercar dealers',
      messagingAngles: [
        'A bike that belongs in the same garage as the car',
        'Reciprocal showroom presence',
        'White-label gifting programme for new car deliveries',
      ],
      weeklyTarget: 8,
      successMetrics: ['5 dealer partnerships signed', '20 demo bikes placed in showrooms', '£100K in placed orders by Q4'],
      disqualifiers: ['Volume dealers (BMW, Audi, MB)', 'Used-only operations'],
    },
    brief: {
      campaignName: 'Supercar dealer accessory partnership',
      objective: 'Sign 5 boutique supercar dealer partnerships with showroom demo bikes by end of Q4.',
      targetAudience: ['Dealer principals', 'Marketing directors'],
      geography: 'London, UK',
      industries: ['Luxury automotive', 'Supercar dealers', 'Classic car specialists'],
      companySizeMin: 5,
      companySizeMax: 30,
      revenueMin: '£5M',
      revenueMax: '£100M',
      channels: ['email', 'event', 'phone'],
      messaging: [
        { angle: 'Lifestyle pairing', line: 'A bike that belongs in the same garage as the car.' },
        { angle: 'Showroom presence', line: 'A demo Evari in your showroom alongside the cars.' },
        { angle: 'Delivery gifting', line: 'White-label gift bike on every new car delivery.' },
      ],
      successMetrics: [
        { name: 'Dealer partnerships', target: '5 signed by Q4' },
        { name: 'Showroom demo bikes', target: '20 placed' },
        { name: 'Placed orders via dealers', target: '£100K by Q4' },
      ],
      idealCustomer:
        'A boutique Mayfair or Knightsbridge supercar dealer with 5-30 staff, average car ticket £200K+, focused on collector clientele.',
    },
    chat: [
      { role: 'user', content: 'Mayfair luxury car dealerships. Want to land them as accessory partners.' },
      { role: 'assistant', content: '**Hypothesis** Supercar dealers want premium accessory partners; the 856 fits naturally as a country-estate companion to the cars they sell.\n\n**Sector & geography** London luxury car dealerships, supercar segment.\n\n**Target persona** Dealer principal or marketing director at boutique supercar dealers.\n\n**Messaging angles**\n1. A bike that belongs in the same garage as the car.\n2. Reciprocal showroom presence.\n3. White-label gifting programme for new car deliveries.\n\n**Success metrics**\n- 5 dealer partnerships signed\n- 20 demo bikes placed in showrooms\n- £100K in placed orders by Q4\n\n**Disqualifiers** Volume dealers (BMW, Audi, MB), used-only operations.' },
    ],
    companies: [
      { name: 'HR Owen Mayfair',          domain: 'hrowen.co.uk',           industry: 'Luxury automotive', size: '51-200', revenue: '£20M+',  location: 'Mayfair, London',      fitScore: 95, stage: 'lead',
        contacts: [
          { fullName: 'Edward Sharpe',  jobTitle: 'Dealer Principal',      email: 'e.sharpe@hrowen.co.uk', phone: '+44 20 7100 1001', linkedin: 'https://linkedin.com/in/edsharpe' },
          { fullName: 'Olivia Mason',   jobTitle: 'Marketing Director',    email: 'o.mason@hrowen.co.uk' },
        ] },
      { name: 'Joe Macari Cars',          domain: 'joemacari.com',          industry: 'Supercar dealer',   size: '11-50',  revenue: '£10M-£20M', location: 'Battersea, London',  fitScore: 91, stage: 'enrichment',
        contacts: [
          { fullName: 'Joe Macari',     jobTitle: 'Dealer Principal',      email: 'joe@joemacari.com', linkedin: 'https://linkedin.com/in/joemacari' },
        ] },
      { name: 'DK Engineering',           domain: 'dkeng.co.uk',            industry: 'Classic car',       size: '11-50',  revenue: '£5M-£10M',  location: 'Chorleywood, UK',     fitScore: 87, stage: 'enrichment',
        contacts: [
          { fullName: 'James Cottingham', jobTitle: 'Sales Director',      email: 'james@dkeng.co.uk' },
        ] },
      { name: 'Romans International',     domain: 'romansinternational.com', industry: 'Luxury automotive', size: '11-50', revenue: '£10M-£20M', location: 'Surrey, UK',        fitScore: 84, stage: 'shortlist' },
      { name: 'Tom Hartley Jnr',          domain: 'tomhartleyjnr.com',      industry: 'Classic car',       size: '5-10',   revenue: '£10M+',     location: 'Derbyshire, UK',     fitScore: 82, stage: 'shortlist' },
      { name: 'Hexagon Classics',         domain: 'hexagonclassics.com',    industry: 'Classic car',       size: '11-50',  revenue: '£5M-£10M',  location: 'London, UK',         fitScore: 80, stage: 'shortlist' },
      { name: 'Talacrest',                domain: 'talacrest.com',          industry: 'Classic car',       size: '5-10',   revenue: '£5M-£10M',  location: 'Ascot, UK',          fitScore: 76, stage: 'discovery' },
      { name: 'Frank Dale & Stepsons',    domain: 'frankdale.com',          industry: 'Classic car',       size: '5-10',   revenue: '£5M-£10M',  location: 'London, UK',         fitScore: 73, stage: 'discovery' },
      { name: 'Simon Furlonger Specialist Cars', domain: 'simonfurlonger.com', industry: 'Supercar dealer', size: '5-10', revenue: '£5M-£10M', location: 'Kent, UK',           fitScore: 70, stage: 'discovery' },
      { name: 'Cliveden House Cars',      domain: 'clivedenhousecars.co.uk', industry: 'Luxury automotive', size: '5-10', revenue: '£5M-£10M',  location: 'Berkshire, UK',      fitScore: 67, stage: 'discovery' },
    ],
  },
  {
    id: 'play-seed-golf-clubs',
    title: 'Premium UK golf clubs',
    pitch:
      'Partner with premium UK private golf clubs whose members are HNW and would love a complementary luxury leisure bike.',
    category: 'Premium UK golf clubs',
    strategyShort:
      'UK private members golf clubs (top 50) whose membership skews HNW retired or semi-retired, looking for off-course leisure pursuits.',
    strategy: {
      hypothesis:
        'Top-tier private golf clubs want curated lifestyle partners; their members are exactly the right HNW demographic for the 856.',
      sector: 'UK private members golf clubs, top 50',
      targetPersona: 'Club secretary, head of membership, or commercial director',
      messagingAngles: [
        'A members-only Evari at-cost programme',
        'Branded fleet for course-side leisure rides',
        'Pro shop reciprocal display',
      ],
      weeklyTarget: 6,
      successMetrics: ['10 club partnerships', '50 member sales referred via clubs', 'First club-branded fleet order'],
      disqualifiers: ['Pay-and-play public courses', 'Resort-only golf'],
    },
    brief: {
      campaignName: 'Private golf club lifestyle partnership',
      objective: 'Land 10 premium golf club partnerships with member-discount programmes by year end.',
      targetAudience: ['Club secretaries', 'Heads of membership', 'Commercial directors'],
      geography: 'United Kingdom',
      industries: ['Golf clubs', 'Private members clubs', 'Luxury leisure'],
      companySizeMin: 10,
      companySizeMax: 100,
      revenueMin: '£1M',
      revenueMax: '£10M',
      channels: ['email', 'event', 'linkedin'],
      messaging: [
        { angle: 'Member benefit', line: 'A members-only Evari at-cost programme.' },
        { angle: 'Course-side fleet', line: 'Branded fleet for off-course leisure rides.' },
        { angle: 'Pro shop reciprocal', line: 'Two-way display deal with the pro shop.' },
      ],
      successMetrics: [
        { name: 'Club partnerships', target: '10 signed' },
        { name: 'Member-referred sales', target: '50 by year end' },
        { name: 'Fleet orders', target: '1 club-branded order' },
      ],
      idealCustomer:
        'A top-50 UK private members golf club, 500-2000 active members, average joining fee £5K+, with a pro shop and curated partner programme.',
    },
    chat: [
      { role: 'user', content: 'Premium UK golf clubs. Land them as lifestyle partners for members.' },
      { role: 'assistant', content: '**Hypothesis** Top-tier private golf clubs want curated lifestyle partners; their members are exactly the right HNW demographic for the 856.\n\n**Sector & geography** UK private members golf clubs, top 50.\n\n**Target persona** Club secretary, head of membership, or commercial director.\n\n**Messaging angles**\n1. A members-only Evari at-cost programme.\n2. Branded fleet for course-side leisure rides.\n3. Pro shop reciprocal display.\n\n**Success metrics**\n- 10 club partnerships\n- 50 member sales referred via clubs\n- First club-branded fleet order\n\n**Disqualifiers** Pay-and-play public courses, resort-only golf.' },
    ],
    companies: [
      { name: 'Wentworth Club',           domain: 'wentworthclub.com',      industry: 'Private golf', size: '51-200', revenue: '£10M+',  location: 'Surrey, UK',     fitScore: 96, stage: 'lead',
        contacts: [
          { fullName: 'Hugo Pemberton', jobTitle: 'Club Secretary',         email: 'h.pemberton@wentworthclub.com', phone: '+44 1344 100000' },
          { fullName: 'Felicity Ramsay', jobTitle: 'Head of Membership',    email: 'f.ramsay@wentworthclub.com', linkedin: 'https://linkedin.com/in/felicityramsay' },
        ] },
      { name: 'Sunningdale Golf Club',    domain: 'sunningdale-golfclub.co.uk', industry: 'Private golf', size: '51-200', revenue: '£10M+', location: 'Berkshire, UK', fitScore: 93, stage: 'enrichment',
        contacts: [
          { fullName: 'Charles Avery', jobTitle: 'Club Secretary',          email: 'secretary@sunningdale-golfclub.co.uk' },
        ] },
      { name: 'The Belfry',               domain: 'thebelfry.co.uk',        industry: 'Private golf', size: '201-500', revenue: '£10M+', location: 'Warwickshire, UK', fitScore: 89, stage: 'enrichment',
        contacts: [
          { fullName: 'Diana Holloway', jobTitle: 'Commercial Director',    email: 'd.holloway@thebelfry.co.uk' },
        ] },
      { name: 'Loch Lomond Golf Club',    domain: 'lochlomond.com',         industry: 'Private golf', size: '51-200', revenue: '£10M+',  location: 'Scotland, UK',  fitScore: 86, stage: 'shortlist' },
      { name: 'Royal Birkdale',           domain: 'royalbirkdale.com',      industry: 'Private golf', size: '11-50',  revenue: '£5M-£10M', location: 'Lancashire, UK', fitScore: 84, stage: 'shortlist' },
      { name: 'Walton Heath Golf Club',   domain: 'whgc.co.uk',             industry: 'Private golf', size: '11-50',  revenue: '£5M-£10M', location: 'Surrey, UK',     fitScore: 81, stage: 'shortlist' },
      { name: 'Royal St Georges',         domain: 'royalstgeorges.com',     industry: 'Private golf', size: '11-50',  revenue: '£5M-£10M', location: 'Kent, UK',       fitScore: 78, stage: 'discovery' },
      { name: 'Carnoustie Golf Links',    domain: 'carnoustiegolflinks.com', industry: 'Private golf', size: '51-200', revenue: '£10M+', location: 'Scotland, UK',  fitScore: 75, stage: 'discovery' },
      { name: 'Royal Lytham',             domain: 'royallytham.org',        industry: 'Private golf', size: '11-50',  revenue: '£5M-£10M', location: 'Lancashire, UK', fitScore: 72, stage: 'discovery' },
      { name: 'Turnberry',                domain: 'trumpturnberry.com',     industry: 'Private golf', size: '201-500', revenue: '£10M+', location: 'Scotland, UK',  fitScore: 69, stage: 'discovery' },
    ],
  },
];

export async function POST() {
  const sb = createSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ ok: false, error: 'no admin client' }, { status: 500 });
  }
  const now = NOW();
  const summary = { plays: 0, briefs: 0, leads: 0, contacts: 0 };

  for (const seed of SEEDS) {
    // 1. Play row
    const activity: PlayActivityEvent[] = [
      { id: 'act-' + seed.id + '-1', at: now, type: 'created', summary: 'Idea seeded.' },
      { id: 'act-' + seed.id + '-2', at: now, type: 'note',    summary: 'Strategy committed from Spitball.' },
      { id: 'act-' + seed.id + '-3', at: now, type: 'note',    summary: 'Auto-scan sourced ' + seed.companies.length + ' candidate companies.' },
    ];
    const chat: PlayChatMessage[] = seed.chat.map((m, i) => ({
      id: 'c-' + seed.id + '-' + i,
      role: m.role,
      content: m.content,
      at: now,
    }));
    const play: Play = {
      id: seed.id,
      title: seed.title,
      brief: seed.pitch,
      stage: 'live',
      createdAt: now,
      updatedAt: now,
      tags: [],
      research: [],
      targets: [],
      messaging: [],
      chat,
      activity,
      strategy: seed.strategy,
      strategyShort: seed.strategyShort,
      category: seed.category,
      autoScan: { status: 'done', startedAt: now, finishedAt: now, inserted: seed.companies.length, found: seed.companies.length, description: seed.strategyShort, locationName: seed.brief.geography },
    };
    const { error: playErr } = await sb.from('dashboard_plays').upsert({ id: seed.id, payload: play });
    if (playErr) {
      return NextResponse.json({ ok: false, where: 'play', error: playErr.message, id: seed.id }, { status: 500 });
    }
    summary.plays++;

    // 2. Strategy brief row (snake_case columns)
    const { error: briefErr } = await sb.from('dashboard_strategy_briefs').upsert(
      {
        play_id: seed.id,
        campaign_name: seed.brief.campaignName,
        objective: seed.brief.objective,
        target_audience: seed.brief.targetAudience,
        geography: seed.brief.geography,
        industries: seed.brief.industries,
        company_size_min: seed.brief.companySizeMin,
        company_size_max: seed.brief.companySizeMax,
        revenue_min: seed.brief.revenueMin,
        revenue_max: seed.brief.revenueMax,
        channels: seed.brief.channels,
        messaging: seed.brief.messaging,
        success_metrics: seed.brief.successMetrics,
        ideal_customer: seed.brief.idealCustomer,
        handoff_status: 'handed_off',
        updated_at: now,
      },
      { onConflict: 'play_id' },
    );
    if (briefErr) {
      return NextResponse.json({ ok: false, where: 'brief', error: briefErr.message, id: seed.id }, { status: 500 });
    }
    summary.briefs++;

    // 3. Lead rows — companies + decision-makers
    for (const c of seed.companies) {
      // Stage maps to lead status / tier
      // discovery   -> tier=prospect, prospectStatus=pending,    Lead.stage='new'
      // shortlist   -> tier=prospect, prospectStatus=qualified,  Lead.stage='new'
      // enrichment  -> tier=prospect, prospectStatus=qualified,  Lead.stage='contacted' (has contacts)
      // lead        -> tier=lead,     prospectStatus undefined,  Lead.stage='discovery' (active conversation)
      const baseId = 'seed-' + seed.id + '-' + slug(c.name);
      const inferredEmail = 'info@' + c.domain;
      const stageMap = c.stage;
      const tier: 'prospect' | 'lead' = stageMap === 'lead' ? 'lead' : 'prospect';
      const prospectStatus =
        stageMap === 'discovery' ? 'pending' :
        stageMap === 'shortlist' ? 'qualified' :
        stageMap === 'enrichment' ? 'qualified' :
        undefined;
      const leadStage =
        stageMap === 'lead' ? 'discovery' :
        stageMap === 'enrichment' ? 'contacted' :
        'new';

      const company: Lead = {
        id: baseId,
        fullName: c.name,
        companyName: c.name,
        companyUrl: 'https://' + c.domain,
        location: c.location,
        address: c.location,
        email: inferredEmail,
        emailInferred: true,
        source: 'outreach_agent',
        sourceCategory: 'outreach',
        sourceDetail: 'Seeded: ' + seed.title,
        stage: leadStage,
        intent: 'unknown',
        firstSeenAt: now,
        lastTouchAt: now,
        tags: [c.industry],
        activity: [
          { id: 'la-' + baseId + '-1', at: now, type: 'lead_created', summary: 'Sourced via auto-scan' },
        ],
        tier,
        category: seed.category,
        playId: seed.id,
        prospectStatus,
        orgProfile: {
          industry: c.industry,
          size: c.size,
          revenue: c.revenue,
          location: c.location,
          fitScore: c.fitScore,
        } as unknown as Lead['orgProfile'],
      };

      const { error: leadErr } = await sb.from('dashboard_leads').upsert({ id: baseId, payload: company });
      if (leadErr) {
        return NextResponse.json({ ok: false, where: 'lead', error: leadErr.message, id: baseId }, { status: 500 });
      }
      summary.leads++;

      // 4. Per-contact lead rows for the decision makers (so Enrichment + Leads pages show real people)
      if (c.contacts && c.contacts.length > 0) {
        for (let i = 0; i < c.contacts.length; i++) {
          const ct = c.contacts[i];
          const cid = baseId + '-c' + i;
          const contactLead: Lead = {
            id: cid,
            fullName: ct.fullName,
            email: ct.email,
            phone: ct.phone,
            jobTitle: ct.jobTitle,
            linkedinUrl: ct.linkedin,
            companyName: c.name,
            companyUrl: 'https://' + c.domain,
            location: c.location,
            source: 'outreach_agent',
            sourceCategory: 'outreach',
            sourceDetail: 'Seeded contact: ' + c.name,
            stage: stageMap === 'lead' ? 'discovery' : 'contacted',
            intent: 'unknown',
            firstSeenAt: now,
            lastTouchAt: now,
            tags: [c.industry, ct.jobTitle],
            activity: [
              { id: 'la-' + cid + '-1', at: now, type: 'lead_created', summary: 'Decision-maker enriched from auto-scan' },
            ],
            tier: stageMap === 'lead' ? 'lead' : 'prospect',
            category: seed.category,
            playId: seed.id,
            prospectStatus: stageMap === 'lead' ? 'sent' : 'qualified',
          };
          const { error: ctErr } = await sb.from('dashboard_leads').upsert({ id: cid, payload: contactLead });
          if (ctErr) {
            return NextResponse.json({ ok: false, where: 'contact', error: ctErr.message, id: cid }, { status: 500 });
          }
          summary.contacts++;
        }
      }
    }
  }

  return NextResponse.json({ ok: true, summary, seeded: SEEDS.map((s) => ({ id: s.id, title: s.title, companies: s.companies.length })) });
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
