import { TopBar } from '@/components/sidebar/TopBar';
import { MiniTrafficChart } from '@/components/briefing/MiniTrafficChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MOCK_TRAFFIC_30D, MOCK_TRAFFIC_SOURCES, MOCK_LANDING_PAGES } from '@/lib/mock/traffic';
import { formatNumber, formatPercent } from '@/lib/utils';

export default function TrafficPage() {
 const totalSessions = MOCK_TRAFFIC_30D.reduce((a, d) => a + d.sessions, 0);
 const totalConv = MOCK_TRAFFIC_30D.reduce((a, d) => a + d.conversions, 0);
 const avgBounce =
  MOCK_TRAFFIC_30D.reduce((a, d) => a + d.bounceRate, 0) / MOCK_TRAFFIC_30D.length;

 return (
  <>
   <TopBar title="Traffic" subtitle="last 30 days" />

   <div className="p-6 max-w-[1400px] space-y-5">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
     <SummaryTile label="Sessions" value={formatNumber(totalSessions)} />
     <SummaryTile label="Conversions" value={formatNumber(totalConv)} />
     <SummaryTile label="Conversion rate" value={formatPercent(totalConv / totalSessions, 2)} />
     <SummaryTile label="Bounce rate" value={formatPercent(avgBounce, 1)} />
    </div>

    <Card>
     <CardHeader className="pb-2 flex flex-row items-center justify-between">
      <CardTitle>Sessions over time</CardTitle>
      <Badge variant="muted">GA4 mock</Badge>
     </CardHeader>
     <CardContent>
      <MiniTrafficChart data={MOCK_TRAFFIC_30D} />
     </CardContent>
    </Card>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
     <Card>
      <CardHeader className="pb-3">
       <CardTitle>Top sources</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
       <table className="w-full text-sm">
        <thead>
         <tr className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer ">
          <th className="text-left px-5 py-2 font-medium">Source / medium</th>
          <th className="text-right px-5 py-2 font-medium">Sessions</th>
          <th className="text-right px-5 py-2 font-medium">Conv.</th>
          <th className="text-right px-5 py-2 font-medium">CVR</th>
         </tr>
        </thead>
        <tbody>
         {MOCK_TRAFFIC_SOURCES.map((s) => (
          <tr key={s.source + '-' + s.medium} className="/60 last:border-0">
           <td className="px-5 py-2.5 text-evari-text">
            <span className="font-medium">{s.source}</span>
            <span className="text-evari-dim"> / {s.medium}</span>
           </td>
           <td className="text-right px-5 py-2.5 font-mono tabular-nums text-evari-dim">
            {formatNumber(s.sessions)}
           </td>
           <td className="text-right px-5 py-2.5 font-mono tabular-nums text-evari-text">
            {formatNumber(s.conversions)}
           </td>
           <td className="text-right px-5 py-2.5 font-mono tabular-nums text-evari-dim">
            {formatPercent(s.conversionRate, 1)}
           </td>
          </tr>
         ))}
        </tbody>
       </table>
      </CardContent>
     </Card>

     <Card>
      <CardHeader className="pb-3">
       <CardTitle>Top landing pages</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
       <table className="w-full text-sm">
        <thead>
         <tr className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer ">
          <th className="text-left px-5 py-2 font-medium">Path</th>
          <th className="text-right px-5 py-2 font-medium">Sessions</th>
          <th className="text-right px-5 py-2 font-medium">Conv.</th>
          <th className="text-right px-5 py-2 font-medium">GSC pos.</th>
         </tr>
        </thead>
        <tbody>
         {MOCK_LANDING_PAGES.map((p) => (
          <tr key={p.path} className="/60 last:border-0">
           <td className="px-5 py-2.5 text-evari-text font-mono text-xs truncate max-w-[260px]">
            {p.path}
           </td>
           <td className="text-right px-5 py-2.5 font-mono tabular-nums text-evari-dim">
            {formatNumber(p.sessions)}
           </td>
           <td className="text-right px-5 py-2.5 font-mono tabular-nums text-evari-text">
            {formatNumber(p.conversions)}
           </td>
           <td className="text-right px-5 py-2.5 font-mono tabular-nums text-evari-dim">
            {p.avgPositionGSC?.toFixed(1) ?? '—'}
           </td>
          </tr>
         ))}
        </tbody>
       </table>
      </CardContent>
     </Card>
    </div>
   </div>
  </>
 );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
 return (
  <div className="rounded-lg bg-evari-surface p-4">
   <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium mb-1.5">
    {label}
   </div>
   <div className="text-2xl font-medium tracking-tight text-evari-text font-mono tabular-nums">
    {value}
   </div>
  </div>
 );
}
