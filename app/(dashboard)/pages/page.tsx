import { TopBar } from '@/components/sidebar/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import { MOCK_PAGES } from '@/lib/mock/seo';
import { formatNumber, relativeTime } from '@/lib/utils';

const TYPE_TONE = {
  home: 'gold',
  product: 'accent',
  collection: 'info',
  blog: 'muted',
  page: 'outline',
} as const;

export default function PagesPage() {
  const sorted = [...MOCK_PAGES].sort((a, b) => b.organicSessions30d - a.organicSessions30d);

  return (
    <>
      <TopBar title="Pages" subtitle={String(MOCK_PAGES.length) + ' tracked'} />

      <div className="p-6 max-w-[1400px] space-y-5">
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer border-b border-evari-edge">
                  <th className="text-left px-5 py-3 font-medium">Page</th>
                  <th className="text-left px-5 py-3 font-medium">Type</th>
                  <th className="text-left px-5 py-3 font-medium">Primary keyword</th>
                  <th className="text-right px-5 py-3 font-medium">Organic 30d</th>
                  <th className="text-right px-5 py-3 font-medium">Conv. 30d</th>
                  <th className="text-right px-5 py-3 font-medium">Issues</th>
                  <th className="text-right px-5 py-3 font-medium">Edited</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.id} className="border-b border-evari-edge/60 last:border-0 hover:bg-evari-carbon transition-colors">
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium text-evari-text">{p.title}</div>
                      <div className="text-[11px] font-mono text-evari-dim flex items-center gap-1 mt-0.5">
                        {p.path}
                        <a
                          href={'https://evari.cc' + p.path}
                          target="_blank"
                          rel="noreferrer"
                          className="text-evari-dimmer hover:text-evari-gold"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      {!p.metaDescription && (
                        <Badge variant="warning" className="text-[9px] mt-1.5">
                          missing meta description
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={TYPE_TONE[p.type]} className="text-[10px] capitalize">
                        {p.type}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-evari-dim">
                      {p.primaryKeyword ?? <span className="italic text-evari-dimmer">unset</span>}
                    </td>
                    <td className="text-right px-5 py-3 font-mono tabular-nums text-evari-text">
                      {formatNumber(p.organicSessions30d)}
                    </td>
                    <td className="text-right px-5 py-3 font-mono tabular-nums text-evari-text">
                      {formatNumber(p.conversions30d)}
                    </td>
                    <td className="text-right px-5 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {p.issues.length === 0 ? (
                          <span className="text-evari-dimmer text-xs">—</span>
                        ) : (
                          p.issues.map((sev, i) => (
                            <span
                              key={i}
                              className={
                                'h-1.5 w-1.5 rounded-full ' +
                                (sev === 'critical'
                                  ? 'bg-red-400'
                                  : sev === 'warning'
                                    ? 'bg-amber-400'
                                    : 'bg-sky-400')
                              }
                            />
                          ))
                        )}
                      </div>
                    </td>
                    <td className="text-right px-5 py-3 text-xs text-evari-dim font-mono tabular-nums">
                      {relativeTime(p.lastEditedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
