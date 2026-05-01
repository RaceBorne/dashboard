import { Suspense } from 'react';
import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { AIAssistantPane, AIPaneProvider } from '@/components/ai/AIAssistantPane';
import { IdleScreensaver } from '@/components/dashboard/IdleScreensaver';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Root viewport: h-screen + outer overflow-hidden so sidebar + AI
  // pane stay fixed. The <main> element vertically scrolls when its
  // content exceeds the viewport; TopBar uses sticky top-0 to stay
  // pinned inside that scroll. Pages with fixed bottom rails (Strategy
  // / Discovery timelines) use position:fixed for those rails, so they
  // are unaffected by main's scroll.
  //
  // AppSidebar is wrapped in Suspense because it now uses
  // useSearchParams() to drive the strategy-step active-match logic.
  // Next.js 16 requires a Suspense boundary around any client
  // component that calls useSearchParams() to allow static
  // prerendering of the surrounding pages.
  return (
    <AIPaneProvider>
      <div className="h-screen flex bg-evari-ink overflow-hidden">
        <Suspense fallback={<div className="w-[320px] shrink-0 bg-evari-surface" />}>
          <AppSidebar />
        </Suspense>
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden">{children}</main>
        <AIAssistantPane />
        <CommandPalette />
        <IdleScreensaver />
      </div>
    </AIPaneProvider>
  );
}
