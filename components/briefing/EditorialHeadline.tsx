import { format } from 'date-fns';
import type { BriefingPayload } from '@/lib/types';

/**
 * Replaces the six rounded-rectangle metric tiles with an editorial paragraph.
 * Same data, but written like a newspaper dateline — numbers picked out in
 * brighter weight, everything else flowing as prose. No boxes, no grid.
 */
export function EditorialHeadline({
  briefing,
}: {
  briefing: BriefingPayload;
}) {
  // Pull the key values out of the metrics array by label.
  const byLabel = Object.fromEntries(
    briefing.metrics.map((m) => [m.label, m]),
  );
  const sessions = byLabel['Sessions, last 7 days'];
  const conversions = byLabel['Conversions, last 7'];
  const newLeads = byLabel['New leads, 24h'];
  const seoFindings = byLabel['SEO findings'];
  const topSource = byLabel['Top source, 7d'];
  const postsToday = byLabel['Posts scheduled today'];

  const today = new Date();
  const hours = today.getHours();
  const salutation =
    hours < 5
      ? 'Late night.'
      : hours < 12
        ? 'Morning.'
        : hours < 18
          ? 'Afternoon.'
          : 'Evening.';

  return (
    <section className="pb-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-evari-dimmer font-medium mb-3">
        {format(today, 'EEEE, d LLLL yyyy')}
      </div>
      <p className="text-[15px] leading-[1.75] max-w-3xl text-evari-dim">
        <span className="text-evari-text font-medium">{salutation}</span>{' '}
        {sessions && (
          <>
            Sessions are at{' '}
            <N>{sessions.value}</N> for the last seven days
            {sessions.delta && (
              <>
                , <Delta value={sessions.delta} trend={sessions.trend} />{' '}
                against the prior week
              </>
            )}
            .{' '}
          </>
        )}
        {conversions && (
          <>
            <N>{conversions.value}</N> conversions{' '}
            {conversions.helper && (
              <span className="text-evari-dimmer">
                ({conversions.helper.toLowerCase()})
              </span>
            )}
            {conversions.delta && (
              <>
                , <Delta value={conversions.delta} trend={conversions.trend} />
              </>
            )}
            .{' '}
          </>
        )}
        {newLeads && (
          <>
            <N>{newLeads.value}</N> new{' '}
            {Number(newLeads.value) === 1 ? 'lead' : 'leads'} in the last 24
            hours
            {newLeads.helper && (
              <>, <span>{newLeads.helper.toLowerCase()}</span></>
            )}
            .{' '}
          </>
        )}
        {topSource && (
          <>
            <N>{topSource.value}</N> leads the traffic mix{' '}
            {topSource.helper && (
              <span className="text-evari-dimmer">({topSource.helper})</span>
            )}
            .{' '}
          </>
        )}
        {seoFindings && (
          <>
            SEO Health is flagging{' '}
            <N>{seoFindings.value}</N>
            {' — worth a look.'}{' '}
          </>
        )}
        {postsToday && Number(postsToday.value) > 0 && (
          <>
            <N>{postsToday.value}</N>{' '}
            {Number(postsToday.value) === 1 ? 'post' : 'posts'} queued for
            today{' '}
            <span className="text-evari-dimmer">({postsToday.helper}).</span>
          </>
        )}
      </p>
    </section>
  );
}

// -- Inline helpers ----------------------------------------------------------

function N({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-evari-text font-medium tabular-nums">
      {children}
    </span>
  );
}

function Delta({
  value,
  trend,
}: {
  value: string;
  trend?: 'up' | 'down' | 'flat';
}) {
  const tone =
    trend === 'up'
      ? 'text-evari-success'
      : trend === 'down'
        ? 'text-evari-danger'
        : 'text-evari-dim';
  const glyph = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  // The stored delta already starts with + or - — replace with the arrow.
  const cleaned = value.replace(/^[+-]\s?/, '');
  return (
    <span className={`${tone} tabular-nums font-medium`}>
      {glyph} {cleaned}
    </span>
  );
}
