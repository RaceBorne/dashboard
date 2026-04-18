'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrafficDay } from '@/lib/types';

export function MiniTrafficChart({ data }: { data: TrafficDay[] }) {
  return (
    <div className="h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="sessionsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(0 80% 55%)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="hsl(0 80% 55%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            stroke="hsl(0 0% 36%)"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ stroke: 'hsl(0 0% 22%)', strokeWidth: 1 }}
            contentStyle={{
              background: 'hsl(0 0% 7%)',
              border: '1px solid hsl(0 0% 18%)',
              borderRadius: 8,
              fontSize: 12,
              padding: '8px 10px',
            }}
            labelStyle={{ color: 'hsl(0 0% 60%)', fontSize: 10 }}
          />
          <Area
            type="monotone"
            dataKey="sessions"
            stroke="hsl(0 80% 55%)"
            strokeWidth={1.5}
            fill="url(#sessionsGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
