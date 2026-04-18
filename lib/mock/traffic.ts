import type { TrafficDay, TrafficSourceRow, LandingPageRow } from '@/lib/types';

function generateTrafficDays(days: number): TrafficDay[] {
  const out: TrafficDay[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dow = date.getDay();
    const weekdayBoost = dow === 0 || dow === 6 ? 1.4 : 1;
    const seasonalBoost = 1 + Math.sin((i / days) * Math.PI) * 0.18;
    const noise = 0.85 + Math.random() * 0.3;
    const sessions = Math.round(220 * weekdayBoost * seasonalBoost * noise);
    const users = Math.round(sessions * (0.78 + Math.random() * 0.06));
    const conversions = Math.round(sessions * (0.024 + Math.random() * 0.018));
    out.push({
      date: date.toISOString().slice(0, 10),
      sessions,
      users,
      bounceRate: 0.42 + (Math.random() - 0.5) * 0.08,
      avgDurationSec: Math.round(140 + Math.random() * 60),
      conversions,
    });
  }
  return out;
}

export const MOCK_TRAFFIC_30D = generateTrafficDays(30);

export const MOCK_TRAFFIC_SOURCES: TrafficSourceRow[] = [
  { source: 'google', medium: 'organic', sessions: 2840, conversions: 71, conversionRate: 0.025 },
  { source: 'instagram', medium: 'paid_social', sessions: 1620, conversions: 28, conversionRate: 0.017 },
  { source: '(direct)', medium: '(none)', sessions: 1180, conversions: 38, conversionRate: 0.032 },
  { source: 'instagram', medium: 'organic_social', sessions: 745, conversions: 11, conversionRate: 0.015 },
  { source: 'newsletter', medium: 'email', sessions: 510, conversions: 22, conversionRate: 0.043 },
  { source: 'google', medium: 'cpc', sessions: 420, conversions: 6, conversionRate: 0.014 },
  { source: 'cyclist.co.uk', medium: 'referral', sessions: 308, conversions: 14, conversionRate: 0.045 },
  { source: 'rapha.cc', medium: 'referral', sessions: 142, conversions: 9, conversionRate: 0.063 },
  { source: 'linkedin', medium: 'organic_social', sessions: 110, conversions: 3, conversionRate: 0.027 },
  { source: 'tiktok', medium: 'organic_social', sessions: 86, conversions: 1, conversionRate: 0.012 },
];

export const MOCK_LANDING_PAGES: LandingPageRow[] = [
  {
    path: '/',
    sessions: 3120,
    bounceRate: 0.41,
    conversions: 64,
    avgPositionGSC: 6.2,
    impressionsGSC: 18420,
    clicksGSC: 1180,
    ctrGSC: 0.064,
  },
  {
    path: '/products/evari-tour',
    sessions: 1840,
    bounceRate: 0.38,
    conversions: 51,
    avgPositionGSC: 8.4,
    impressionsGSC: 11200,
    clicksGSC: 720,
    ctrGSC: 0.064,
  },
  {
    path: '/products/evari-commuter',
    sessions: 980,
    bounceRate: 0.46,
    conversions: 22,
    avgPositionGSC: 11.8,
    impressionsGSC: 6400,
    clicksGSC: 280,
    ctrGSC: 0.044,
  },
  {
    path: '/pages/craft',
    sessions: 612,
    bounceRate: 0.32,
    conversions: 8,
    avgPositionGSC: 14.2,
    impressionsGSC: 4180,
    clicksGSC: 144,
    ctrGSC: 0.034,
  },
  {
    path: '/pages/configurator',
    sessions: 488,
    bounceRate: 0.28,
    conversions: 31,
    avgPositionGSC: 22.4,
    impressionsGSC: 1820,
    clicksGSC: 88,
    ctrGSC: 0.048,
  },
  {
    path: '/blogs/journal/kustomflow-paint-shop',
    sessions: 320,
    bounceRate: 0.51,
    conversions: 4,
    avgPositionGSC: 9.1,
    impressionsGSC: 2840,
    clicksGSC: 188,
    ctrGSC: 0.066,
  },
  {
    path: '/blogs/journal/why-bosch-cx',
    sessions: 244,
    bounceRate: 0.48,
    conversions: 6,
    avgPositionGSC: 12.0,
    impressionsGSC: 1980,
    clicksGSC: 122,
    ctrGSC: 0.062,
  },
  {
    path: '/pages/finance',
    sessions: 188,
    bounceRate: 0.55,
    conversions: 14,
    avgPositionGSC: 18.6,
    impressionsGSC: 920,
    clicksGSC: 38,
    ctrGSC: 0.041,
  },
];
