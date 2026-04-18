import { TopBar } from '@/components/sidebar/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { MOCK_KEYWORDS } from '@/lib/mock/seo';
import { formatNumber, formatPercent, cn } from '@/lib/utils';

const PRIORITY_TONE = { high: 'accent', medium: 'gold', low: 'muted' } as const;
const INTENT_TONE = {
  transactional: 'success',
  commercial: 'gold',
  informational: 'info',
  navigational: 'muted',
} as const;

export default function KeywordsPage() {
  const sorted = [...MOCK_KEYWORDS].sort((a, b) => b.impressions - a.impressions);
  return (
    <>
      <TopBar title="Keywords" subtitle={String(MOCK_KEYWORDS.length) + ' tracked'} />
      <div className="p-6 max-w-[1400px] space-y-5">
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer border-b border-evari-edge">
                  <th className="text-left px-5 py-3 font-medium">Query</th>
                  <th className="text-left px-5 py-3 font-medium">Intent</th>
                  <th className="text-left px-5 py-3 font-medium">Priority</th>
                  <th className="text-right px-5 py-3 font-medium">Impressions</th>
                  <th className="text-right px-5 py-3 font-medium">Clicks</th>
                  <th className="text-right px-5 py-3 font-medium">CTR</th>
                  <th className="text-right px-5 py-3 font-medium">Position</th>
                  <th className="text-right px-5 py-3 font-medium">7d</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((k) => {
                  const Trend =
                    k.positionDelta7d < 0 ? ArrowUp : k.positionDelta7d > 0 ? ArrowDown : ArrowRight;
                  const trendColor =
                    k.positionDelta7d < 0 ? 'text-emerald-400' : k.positionDelta7d > 0 ? 'text-red-400' : 'text-evari-dim';
                  return (
                    <tr key={k.id} className="border-b border-evari-edge/60 last:border-0 hover:bg-evari-carbon transition-colors">
                      <td className="px-5 py-3">
                        <div className="text-sm text-evari-text">{k.query}</div>
                        {k.url && (
                          <div className="text-[11px] font-mono text-evari-dimmer mt-0.5">{k.url}</div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={INTENT_TONE[k.intent]} className="text-[10px] capitalize">
                          {k.intent}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={PRIORITY_TONE[k.priority]} className="text-[10px] capitalize">
                          {k.priority}
                        </Badge>
                      </td>
                      <td className="text-right px-5 py-3 font-mono tabular-nums text-evari-dim">
                        {formatNumber(k.impressions)}
                      </td>
                      <td className="text-right px-5 py-3 font-mono tabular-nums text-evari-text">
                        {formatNumber(k.clicks)}
                      </td>
                      <td className="text-right px-5 py-3 font-mono tabular-nums text-evari-dim">
                        {formatPercent(k.ctr, 1)}
                      </td>
                      <td className="text-right px-5 py-3 font-mono tabular-nums text-evari-text">
                        {k.position.toFixed(1)}
                      </td>
                      <td className="text-right px-5 py-3">
                        <span className={cn('inline-flex items-center gap-0.5 text-xs font-mono', trendColor)}>
                          <Trend className="h-3 w-3" />
                          {Math.abs(k.positionDelta7d).toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
